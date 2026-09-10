import pg from 'pg';
import fs from 'fs';
import { parsearDescripcion, matchScore, construirIndice, candidatosPara } from './lib/cobecaParser.mjs';
import { config } from 'dotenv';
config();

async function main() {
  // ids perdidos vs ganaron
  function leerCsv(p) {
    const lines = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/).slice(1);
    return lines.map(l => l.split(',')[0].replace(/^"|"$/g, ''));
  }
  const antiguo = new Set(leerCsv('data/productos_sin_foto_antiguo.csv'));
  const nuevo = new Set(leerCsv('data/productos_sin_foto.csv'));
  const perdidos = [...nuevo].filter(id => !antiguo.has(id));
  console.log('Perdidos:', perdidos.length);

  const client = new pg.Client({
    host: process.env.SUPABASE_DB_HOST,
    port: process.env.SUPABASE_DB_PORT || 5432,
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER,
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const { rows: productos } = await client.query(
    `SELECT id, nombre_comercial, molecula, forma, laboratorio FROM public.productos WHERE id = ANY($1::int[])`,
    [perdidos]
  );
  const byId = new Map(productos.map(p => [String(p.id), p]));
  console.log('Productos cargados:', productos.length);

  const raw = JSON.parse(fs.readFileSync('data/fotos.json', 'utf-8'));
  const descs = raw.filter(f => f.imagen).map(f => f.desc_articulo);
  console.log('Descripciones con imagen:', descs.length);

  // preparar parse de todas las descs una sola vez
  const parseds = [];
  for (const d of descs) {
    const parsed = parsearDescripcion(d);
    parsed._raw = d;
    if (!parsed.forma) continue;
    parseds.push({ parsed, raw: d });
  }
  console.log('Descs parseadas con forma:', parseds.length);

  // Para cada producto perdido, mejor score contra TODAS las descs
  const resultados = [];
  for (const id of perdidos) {
    const p = byId.get(id);
    if (!p) continue;
    let best = null;
    for (const { parsed, raw } of parseds) {
      const s = matchScore(parsed, p);
      if (!best || s > best.score) best = { score: s, raw };
    }
    resultados.push({ id, nombre: p.nombre_comercial, ...(best ? { score: best.score, desc: best.raw } : { score: 0, desc: '' }) });
  }

  resultados.sort((a, b) => b.score - a.score);
  const posibles = resultados.filter(r => r.score >= 0.6);
  console.log('\n=== CON SCORE >= 0.6 (HUBO CANDIDATO VÁLIDO que no se asignó — INVESTIGAR) ===');
  for (const r of posibles) {
    console.log(`${r.id} | ${r.nombre} | score=${r.score.toFixed(3)} | desc=${r.desc}`);
  }
  console.log('\n=== MEJOR SCORE < 0.6 (pérdida consistente con reglas actuales) ===');
  for (const r of resultados.filter(r => r.score < 0.6)) {
    console.log(`${r.id} | ${r.nombre} | best=${r.score.toFixed(3)} | desc=${r.desc}`);
  }
  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });