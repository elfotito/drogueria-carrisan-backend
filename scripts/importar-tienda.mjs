// scripts/importar-tienda.mjs
// Copia productos_catalogo (INHRR) -> productos (tienda) como "consultar precio".
// Idempotente: upsert por fuente_inhrr_ef (= ef), dedupe por nombre+laboratorio
// contra productos sin fuente, y desactivación de importados ausentes.
// Uso: node scripts/importar-tienda.mjs   (requiere .env con SUPABASE_URL/SUPABASE_KEY)
import 'dotenv/config';
import { supabase } from '../src/config/supabase.js';

const CHUNK = 500;
const PAGE_SIZE = 1000;

const LINEA_POR_CATEGORIA = {
  ME: 'Linea Farmacia',
  HO: 'Linea Hospitalaria',
  MM: 'Material Medico',
  MI: 'Linea Farmacia',
};

const normalizar = (s = '') =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function fetchAll(table, select) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`[${table}] ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function main() {
  console.log('→ Cargando catálogo INHRR...');
  const catalogo = await fetchAll('productos_catalogo', 'id, ef, nombre, forma, categoria, principio_activo, laboratorio, activo');
  console.log(`  ${catalogo.length} registros en productos_catalogo`);

  const [puente, moleculas] = await Promise.all([
    fetchAll('catalogo_moleculas', 'producto_catalogo_id, molecula_id'),
    fetchAll('moleculas_referencias', 'id, nombre'),
  ]);
  console.log(`  ${puente.length} enlaces catalogo_moleculas`);

  const nombreMolecula = new Map(moleculas.map((m) => [m.id, m.nombre]));
  const moleculasPorCatalogo = new Map();
  for (const enl of puente) {
    if (!moleculasPorCatalogo.has(enl.producto_catalogo_id)) moleculasPorCatalogo.set(enl.producto_catalogo_id, []);
    moleculasPorCatalogo.get(enl.producto_catalogo_id).push(enl.molecula_id);
  }

  const existentes = await fetchAll('productos', 'id, nombre_comercial, laboratorio, fuente_inhrr_ef');

  const porEf = new Map();                 // ef -> id (importados en corridas previas)
  const dedupe = new Map();                // 'nombre|lab' -> id (solo sin fuente)
  for (const p of existentes || []) {
    if (p.fuente_inhrr_ef) { porEf.set(p.fuente_inhrr_ef, p.id); continue; }
    const clave = `${normalizar(p.nombre_comercial)}|${normalizar(p.laboratorio)}`;
    if (clave) dedupe.set(clave, p.id);
  }
  console.log(`  ${porEf.size} ya importados (por ef), ${dedupe.size} sin fuente (para dedupe)`);

  // --- 1) Desactivar importados cuyo ef ya no está activo en el catálogo ---
  const activosEf = new Set(catalogo.filter((c) => c.activo === true).map((c) => c.ef));
  const paraDesactivar = [...porEf.entries()].filter(([ef]) => !activosEf.has(ef)).map(([, id]) => id);
  if (paraDesactivar.length) {
    for (let i = 0; i < paraDesactivar.length; i += CHUNK) {
      const lote = paraDesactivar.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('productos')
        .update({ activo: false, visible_catalogo: false, updated_at: new Date() })
        .in('id', lote);
      if (error) throw error;
    }
    console.log(`  ⚠ ${paraDesactivar.length} importados ausentes desactivados`);
  }

  // --- 2) Construir filas y hacer dedupe por nombre+lab ---
  const filas = [];
  const visto = new Set();
  let omitidos = 0, duplicados = 0;

  for (const c of catalogo) {
    const nombre = (c.nombre || '').trim();
    const laboratorio = (c.laboratorio || '').trim();
    if (!nombre || !c.ef || !laboratorio) { omitidos++; continue; }

    const clave = `${normalizar(nombre)}|${normalizar(laboratorio)}`;
    if (dedupe.has(clave) || visto.has(clave)) { duplicados++; continue; }
    visto.add(clave);

    const moleculaIds = moleculasPorCatalogo.get(c.id) || [];
    const moleculaTexto = moleculaIds
      .map((id) => nombreMolecula.get(id))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .join(' - ') || null;

    filas.push({
      fuente_inhrr_ef: c.ef,
      nombre_comercial: nombre,
      descripcion: c.principio_activo || null,
      laboratorio,
      forma: c.forma || null,
      linea: LINEA_POR_CATEGORIA[c.categoria] || 'Linea Farmacia',
      molecula: moleculaTexto,
      precio_usd: null,
      disponible: false,
      activo: true,
      visible_catalogo: true,
    });
  }

  // --- 3) Upsert por ef, en lotes ---
  let insertadas = 0, actualizadas = 0;
  for (let i = 0; i < filas.length; i += CHUNK) {
    const lote = filas.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('productos')
      .upsert(lote, { onConflict: 'fuente_inhrr_ef' })
      .select('id, fuente_inhrr_ef');
    if (error) throw error;
    for (const row of data || []) {
      if (porEf.has(row.fuente_inhrr_ef)) actualizadas++; else insertadas++;
      porEf.set(row.fuente_inhrr_ef, row.id);
    }
  }

  // --- 4) Poblar producto_moleculas (bridge), sin duplicar ---
  const filasPuente = [];
  const idsImportados = new Set();
  for (const c of catalogo) {
    if (!c.ef) continue;
    const id = porEf.get(c.ef);
    if (typeof id !== 'number') continue; // solo ids reales (de upsert)
    if (idsImportados.has(id)) continue;
    idsImportados.add(id);
    for (const molecula_id of moleculasPorCatalogo.get(c.id) || []) {
      filasPuente.push({ producto_id: id, molecula_id });
    }
  }
  for (let i = 0; i < filasPuente.length; i += CHUNK) {
    const lote = filasPuente.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('producto_moleculas')
      .upsert(lote, { onConflict: 'producto_id,molecula_id', ignoreDuplicates: true });
    if (error) throw error;
  }

  console.log('Resumen:');
  console.log(`  insertadas: ${insertadas}`);
  console.log(`  actualizadas: ${actualizadas}`);
  console.log(`  duplicados (demo/nombre+lab): ${duplicados}`);
  console.log(`  omitidos (sin nombre/ef/laboratorio): ${omitidos}`);
  console.log(`  enlaces producto_moleculas: ${filasPuente.length}`);
}

main().catch((err) => {
  console.error('Importación fallida:', err.message);
  process.exitCode = 1;
});