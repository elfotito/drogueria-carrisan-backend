// src/migrations/scrapeVademecumCima.js
// Uso: node src/migrations/scrapeVademecumCima.js
// Recorre moleculas_referencias, busca cada principio activo en la API pública
// de CIMA (AEMPS), y hace upsert de la ficha técnica en moleculas_ficha_tecnica.

import { supabase } from '../drogueria-carrisan-backend/src/config/supabase.js';
import * as cheerio from 'cheerio';

const CIMA_BASE = 'https://cima.aemps.es/cima/rest';

const PREFIJOS_A_COLUMNA = [
  ['4.1', 'indicaciones_terapeuticas'],
  ['4.2', 'posologia'],
  ['4.3', 'contraindicaciones'],
  ['4.4', 'advertencias'],
  ['4.5', 'interacciones'],
  ['4.6', 'embarazo_lactancia'],
  ['4.8', 'efectos_adversos'],
  ['4.9', 'sobredosis'],
];

function columnaParaSeccion(codigo) {
  const match = PREFIJOS_A_COLUMNA.find(
    ([prefijo]) => codigo === prefijo || codigo.startsWith(prefijo + '.')
  );
  return match ? match[1] : null;
}

function limpiarHtml(html) {
  if (!html) return null;
  const $ = cheerio.load(html);
  const texto = $.root().text();
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio || null;
}
async function buscarPorPrincipioActivo(nombre) {
  const url = `${CIMA_BASE}/medicamentos?practiv1=${encodeURIComponent(nombre)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`    [CIMA] HTTP ${res.status} buscando "${nombre}"`);
      return null;
    }
    const data = await res.json();
    if (!data.resultados || data.resultados.length === 0) {
      console.log(`    [CIMA] 0 resultados para "${nombre}"`);
      return null;
    }
    const conFicha = data.resultados.find(m => (m.docs || []).some(d => d.tipo === 1));
    return conFicha || data.resultados[0];
  } catch (err) {
    console.log(`    [CIMA] error de red buscando "${nombre}": ${err.message}`);
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function obtenerFichaCompleta(nregistro) {
  const url = `${CIMA_BASE}/docSegmentado/contenido/1?nregistro=${encodeURIComponent(nregistro)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  // defensivo: puede venir como array plano o envuelto en { secciones: [...] }
  return Array.isArray(data) ? data : (data.secciones || []);
}

async function procesarMolecula(molecula) {
  const encontrado = await buscarPorPrincipioActivo(molecula.nombre);
  if (!encontrado) {
    console.log(`  sin match en CIMA: ${molecula.nombre}`);
    return;
  }

  const nregistro = encontrado.nregistro;
  const secciones = await obtenerFichaCompleta(nregistro);
  

      const bloques = new Map(); // columna -> Map(codigoSeccion -> texto)

  for (const seccion of secciones) {
    const columna = columnaParaSeccion(seccion.seccion);
    if (!columna) continue;
    const texto = limpiarHtml(seccion.contenido);
    if (!texto) continue;
    if (!bloques.has(columna)) bloques.set(columna, new Map());
    bloques.get(columna).set(seccion.seccion, texto); // misma clave = se sobrescribe, no se duplica
  }

  const datosFicha = {};
  for (const [columna, mapaSecciones] of bloques) {
    datosFicha[columna] = Array.from(mapaSecciones.values()).join('\n\n');
  }

  if (Object.keys(datosFicha).length === 0) {
    console.log(`  match (${nregistro}) pero sin secciones mapeadas: ${molecula.nombre}`);
    return;
  }

  const { error } = await supabase
    .from('moleculas_ficha_tecnica')
    .upsert(
      {
        molecula_id: molecula.id,
        cima_nregistro: nregistro,
        fuente: 'AEMPS - CIMA (España)',
        ...datosFicha,
        updated_at: new Date(),
      },
      { onConflict: 'molecula_id' }
    );

  if (error) {
    console.error(`  ERROR guardando ${molecula.nombre}:`, error.message);
    return;
  }

  console.log(`  OK: ${molecula.nombre} -> nregistro ${nregistro} (${Object.keys(datosFicha).length} secciones)`);
}

async function procesarRango(desde, hasta) {
  const { data: yaHechas, error: errorHechas } = await supabase
    .from('moleculas_ficha_tecnica')
    .select('molecula_id');

  if (errorHechas) {
    console.error('Error al leer moleculas_ficha_tecnica:', errorHechas.message);
    process.exit(1);
  }

  const idsHechos = new Set((yaHechas || []).map(r => r.molecula_id));

  const { data: moleculas, error } = await supabase
    .from('moleculas_referencias')
    .select('id, nombre, nombre_generico_en')
    .order('id', { ascending: true })
    .range(desde, hasta);

  if (error) {
    console.error('Error al leer moleculas_referencias:', error.message);
    process.exit(1);
  }

  const pendientes = moleculas.filter(m => !idsHechos.has(m.id));

  console.log(`\nRango ${desde}-${hasta}: ${moleculas.length} moléculas, ${pendientes.length} pendientes (${moleculas.length - pendientes.length} ya hechas, se saltan)`);

  for (const molecula of pendientes) {
    console.log(`  ${molecula.nombre}`);
    try {
      await procesarMolecula(molecula);
    } catch (err) {
      console.error(`    ERROR en ${molecula.nombre}:`, err.message);
    }
    await sleep(800);
  }

  return moleculas.length;
}

async function main() {
  const args = process.argv.slice(2);
  const desdeGlobal = args[0] ? parseInt(args[0], 10) : 0;
  const hastaGlobal = args[1] ? parseInt(args[1], 10) : desdeGlobal + 199;
  const TAMANO_BLOQUE = 200;

  let inicio = desdeGlobal;
  while (inicio <= hastaGlobal) {
    const fin = Math.min(inicio + TAMANO_BLOQUE - 1, hastaGlobal);
    const cantidad = await procesarRango(inicio, fin);
    if (cantidad === 0) break; // se acabaron las filas, no seguir pidiendo rangos vacíos
    inicio += TAMANO_BLOQUE;
  }

  console.log('\nListo todo el rango solicitado.');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});