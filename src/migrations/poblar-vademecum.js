#!/usr/bin/env node
/**
 * Extrae la clasificación ATC completa y los principios activos desde la
 * API pública CIMA (AEMPS - España) y genera dos CSV listos para importar
 * a Supabase:
 *   - atc_clasificaciones_import.csv
 *   - moleculas_referencias_import.csv  (con columna auxiliar atc_codigo,
 *     que se resuelve a atc_id vía el script poblar-vademecum.sql)
 *
 * Uso:  node poblar-vademecum.js
 * Requiere Node 18+ (usa fetch nativo). Sin dependencias externas.
 */

import fs from 'fs';

const BASE = 'https://cima.aemps.es/cima/rest';
const RXNAV = 'https://rxnav.nlm.nih.gov/REST'; // RxNorm (NLM, dominio público, uso comercial permitido)
const DELAY_MS = 150; // rate limiting entre llamadas, para no saturar la API

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'es-ES,es;q=0.9',
};

async function cimaGet(path, intentos = 3) {
  for (let intento = 1; intento <= intentos; intento++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(`${BASE}${path}`, { headers: HEADERS, signal: controller.signal });
      clearTimeout(timeoutId);
      const raw = await res.text();
      if (!res.ok) throw new Error(`CIMA ${path} -> HTTP ${res.status}. Cuerpo: ${raw.slice(0, 300)}`);
      if (!raw || raw.trim() === '') throw new Error(`CIMA ${path} -> respuesta vacía`);
      return JSON.parse(raw);
    } catch (e) {
      clearTimeout(timeoutId);
      const esUltimoIntento = intento === intentos;
      if (esUltimoIntento) throw new Error(`CIMA ${path} falló tras ${intentos} intentos: ${e.message}`);
      await sleep(1000 * intento);
    }
  }
}

async function fetchJson(url, intentos = 3) {
  for (let intento = 1; intento <= intentos; intento++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      clearTimeout(timeoutId);
      const raw = await res.text();
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}. Cuerpo: ${raw.slice(0, 300)}`);
      if (!raw || raw.trim() === '') throw new Error(`${url} -> respuesta vacía`);
      return JSON.parse(raw);
    } catch (e) {
      clearTimeout(timeoutId);
      const esUltimoIntento = intento === intentos;
      if (esUltimoIntento) throw new Error(`${url} falló tras ${intentos} intentos: ${e.message}`);
      await sleep(1000 * intento);
    }
  }
}

// Convierte un array JS a literal de array de Postgres: {"a","b"}
// (para importar directo a una columna text[] con ::text[] en el SQL)
function pgArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '';
  const escaped = arr.map((s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `{${escaped.join(',')}}`;
}

// ---------- CSV helpers ----------
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows, headers) {
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  return lines.join('\n');
}

// ---------- Fase A: ATC completo (maestra=7) ----------
const LETRAS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

// Descarga un maestro completo (ATC=7, principios activos=1) particionando
// por letra inicial del nombre, porque sin filtro la API de CIMA no responde
// (arma la lista completa en memoria antes de paginar). Con "nombre" filtrado
// el conjunto es chico y responde rápido -- confirmado manualmente.
async function descargarMaestraPorLetra(maestraId, etiqueta) {
  const vistos = new Map(); // dedupe por codigo o id (algunas letras se solapan)
  for (const letra of LETRAS) {
    let pagina = 1;
    while (true) {
      let data;
      try {
        data = await cimaGet(`/maestras?maestra=${maestraId}&nombre=${encodeURIComponent(letra)}&pagina=${pagina}`);
      } catch (e) {
        console.warn(`  aviso: letra "${letra}" (${etiqueta}) falló, se omite -> ${e.message}`);
        break;
      }
      const resultados = data.resultados || [];
      if (resultados.length === 0) break;
      for (const item of resultados) {
        const clave = item.codigo || item.id;
        if (!vistos.has(clave)) vistos.set(clave, item);
      }
      const tamanioPagina = data.tamanioPagina || resultados.length;
      const totalPaginas = Math.ceil((data.totalFilas || resultados.length) / tamanioPagina);
      if (pagina >= totalPaginas) break;
      pagina++;
      await sleep(DELAY_MS);
    }
    console.log(`  letra "${letra}" (${etiqueta}): ${vistos.size} acumulados`);
    await sleep(DELAY_MS);
  }
  return [...vistos.values()];
}

async function descargarAtc() {
  return descargarMaestraPorLetra(7, 'ATC');
}

function nivelDeCodigo(codigo) {
  const len = codigo.length;
  if (len === 1) return 1; // A
  if (len === 3) return 2; // A01
  if (len === 4) return 3; // A01A
  if (len === 5) return 4; // A01AA
  if (len === 7) return 5; // A01AA01
  return null; // código atípico, revisar manualmente
}

// ---------- Fase B: Principios activos (maestra=1) + su ATC ----------
async function descargarPrincipiosActivos() {
  return descargarMaestraPorLetra(1, 'principios activos');
}

async function atcParaPrincipioActivo(idPractiv1) {
  const data = await cimaGet(`/medicamentos?idpractiv1=${idPractiv1}&pagina=1`);
  if (!data.resultados || data.resultados.length === 0) return null;
  // Buscamos, en cualquiera de los medicamentos devueltos, un código ATC
  // de nivel 5 (sustancia química) -- es el que corresponde a la molécula.
  for (const med of data.resultados) {
    if (!med.atcs) continue;
    const nivel5 = med.atcs.find((a) => a.codigo.length === 7);
    if (nivel5) return nivel5.codigo;
  }
  return null;
}

async function rxnormBuscar(nombreEs) {
  // 1) intento de coincidencia exacta
  let data = await fetchJson(`${RXNAV}/rxcui.json?name=${encodeURIComponent(nombreEs)}`);
  let rxcui = data?.idGroup?.rxnormId?.[0];

  // 2) si no hay match exacto, coincidencia aproximada (typos, nombre en español, etc.)
  if (!rxcui) {
    const approx = await fetchJson(
      `${RXNAV}/approximateTerm.json?term=${encodeURIComponent(nombreEs)}&maxEntries=1`
    );
    rxcui = approx?.approximateGroup?.candidate?.[0]?.rxcui;
  }
  if (!rxcui) return { nombreEn: null, sinonimos: [] };

  // 3) nombres y sinónimos asociados a ese rxcui
  const props = await fetchJson(`${RXNAV}/rxcui/${rxcui}/allProperties.json?prop=names`);
  const concepts = props?.propConceptGroup?.propConcept || [];

  const nombreEn = concepts.find((c) => c.propName === 'RxNorm Name')?.propValue || null;
  const sinonimos = [
    ...new Set(concepts.filter((c) => c.propName === 'Synonym').map((c) => c.propValue)),
  ].filter((s) => s && s.toLowerCase() !== (nombreEn || '').toLowerCase());

  return { nombreEn, sinonimos };
}

function toTitleCase(s) {
  return s.toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, (_, sp, c) => sp + c.toUpperCase());
}

async function main() {
  console.log('Descargando clasificación ATC completa (maestra=7)...');
  const atcItems = await descargarAtc();
  console.log(`ATC: ${atcItems.length} códigos descargados`);

  const atcRows = atcItems
    .map((it) => ({
      codigo: it.codigo,
      nombre: it.nombre,
      nivel: nivelDeCodigo(it.codigo),
      es_sistema: true,
    }))
    .filter((r) => r.nivel !== null);

  fs.writeFileSync(
    'atc_clasificaciones_import.csv',
    toCsv(atcRows, ['codigo', 'nombre', 'nivel', 'es_sistema'])
  );
  console.log(`-> atc_clasificaciones_import.csv (${atcRows.length} filas)`);

  console.log('\nDescargando principios activos (maestra=1)...');
  const principios = await descargarPrincipiosActivos();
  console.log(`Principios activos: ${principios.length}`);
  console.log('Resolviendo ATC de cada uno (1 llamada por principio activo, puede tardar)...');

  const moleculaRows = [];
  let i = 0;
  for (const pa of principios) {
    i++;
    if (i % 50 === 0) console.log(`  ${i}/${principios.length}...`);
    let atcCodigo = null;
    try {
      atcCodigo = await atcParaPrincipioActivo(pa.id);
    } catch (e) {
      console.warn(`  aviso: fallo ATC para "${pa.nombre}" (${e.message})`);
    }
    await sleep(DELAY_MS);

    let nombreEn = null;
    let sinonimos = [];
    try {
      const rx = await rxnormBuscar(pa.nombre);
      nombreEn = rx.nombreEn;
      sinonimos = rx.sinonimos;
    } catch (e) {
      console.warn(`  aviso: fallo RxNorm para "${pa.nombre}" (${e.message})`);
    }

    moleculaRows.push({
      nombre: toTitleCase(pa.nombre),
      nombre_generico_en: nombreEn ? toTitleCase(nombreEn) : '', // sin match -> curar manualmente
      sinonimos: pgArrayLiteral(sinonimos), // literal Postgres {"a","b"}, vacío si no hubo match
      descripcion: '',
      atc_codigo: atcCodigo || '', // se resuelve a atc_id en el paso SQL
    });
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(
    'moleculas_referencias_import.csv',
    toCsv(moleculaRows, ['nombre', 'nombre_generico_en', 'sinonimos', 'descripcion', 'atc_codigo'])
  );
  console.log(`-> moleculas_referencias_import.csv (${moleculaRows.length} filas)`);

  const sinAtc = moleculaRows.filter((r) => !r.atc_codigo).length;
  const sinNombreEn = moleculaRows.filter((r) => !r.nombre_generico_en).length;
  console.log(`\nAviso: ${sinAtc} principios activos quedaron sin ATC nivel 5 (revisar manualmente).`);
  console.log(`Aviso: ${sinNombreEn} principios activos quedaron sin match en RxNorm (revisar manualmente, o repasar con IA traductora).`);
}

main().catch((e) => {
  console.error('Error fatal:', e.message);
  process.exitCode = 1;
});
