// src/migrations/scrapeVademecumCima.js
// Uso: node src/migrations/scrapeVademecumCima.js
// Recorre moleculas_referencias, busca cada principio activo en la API pública
// de CIMA (AEMPS), y hace upsert de la ficha técnica en moleculas_ficha_tecnica.

import { supabase } from '../config/supabase.js';

const CIMA_BASE = 'https://cima.aemps.es/cima/rest';

const SECCION_A_COLUMNA = {
  '4.1': 'indicaciones_terapeuticas',
  '4.2': 'posologia',
  '4.3': 'contraindicaciones',
  '4.4': 'advertencias',
  '4.5': 'interacciones',
  '4.6': 'embarazo_lactancia',
  '4.8': 'efectos_adversos',
  '4.9': 'sobredosis',
};

async function buscarPorPrincipioActivo(nombre) {
  const url = `${CIMA_BASE}/medicamentos?practiv1=${encodeURIComponent(nombre)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.resultados || data.resultados.length === 0) return null;
  const conFicha = data.resultados.find(m => (m.docs || []).some(d => d.tipo === 1));
  return conFicha || data.resultados[0];
}

async function obtenerSeccionesFicha(nregistro) {
  const url = `${CIMA_BASE}/docSegmentado/secciones/1?nregistro=${encodeURIComponent(nregistro)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.secciones || data || [];
}

async function obtenerContenidoSeccion(nregistro, seccionId) {
  const url = `${CIMA_BASE}/docSegmentado/contenido/1?nregistro=${encodeURIComponent(nregistro)}&seccion=${encodeURIComponent(seccionId)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.contenido || null; // confirmar nombre real del campo con la prueba de abajo
}

function limpiarHtml(html) {
  if (!html) return null;
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function procesarMolecula(molecula) {
  const encontrado = await buscarPorPrincipioActivo(molecula.nombre_generico_en || molecula.nombre);
  if (!encontrado) {
    console.log(`  sin match en CIMA: ${molecula.nombre}`);
    return;
  }

  const nregistro = encontrado.nregistro;
  const secciones = await obtenerSeccionesFicha(nregistro);

  const datosFicha = {};
  for (const seccion of secciones) {
    const idSeccion = seccion.id || seccion.seccion;
    const columna = SECCION_A_COLUMNA[idSeccion];
    if (!columna) continue;
    const contenido = await obtenerContenidoSeccion(nregistro, idSeccion);
    datosFicha[columna] = limpiarHtml(contenido);
    await sleep(300); // no saturar la API pública
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

async function main() {
  const { data: moleculas, error } = await supabase
    .from('moleculas_referencias')
    .select('id, nombre, nombre_generico_en')
    .order('id', { ascending: true });

  if (error) {
    console.error('Error al leer moleculas_referencias:', error.message);
    process.exit(1);
  }

  console.log(`Procesando ${moleculas.length} moléculas...`);

  for (const molecula of moleculas) {
    console.log(`\n${molecula.nombre}`);
    try {
      await procesarMolecula(molecula);
    } catch (err) {
      console.error(`  ERROR en ${molecula.nombre}:`, err.message);
    }
    await sleep(300);
  }

  console.log('\nListo.');
}

main();