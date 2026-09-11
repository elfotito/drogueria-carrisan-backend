// scripts/cargar-fotos-cobeca.mjs
// Carga URLs de fotos de COBECA en productos.foto_url
// Lee data/fotos.json, enlaza contra productos via COBECA parser, actualiza foto_url

import pg from 'pg';
import fs from 'fs';
import { parsearDescripcion, matchScore, tieneAncla, construirIndice, candidatosPara } from './lib/cobecaParser.mjs';
import { config } from 'dotenv';

config();

const DB_CONFIG = {
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
};

const UMBRAL = 0.6;
const CHUNK = 200;

async function main() {
  const raw = fs.readFileSync(new URL('../data/fotos.json', import.meta.url), 'utf-8');
  const fotos = JSON.parse(raw);

  console.log(`Fotos totales: ${fotos.length}`);
  const conImagen = fotos.filter(f => f.imagen);
  console.log(`Con imagen: ${conImagen.length}`);

  const client = new pg.Client(DB_CONFIG);
  await client.connect();

  const { rows: productos } = await client.query(`
    SELECT id, nombre_comercial, molecula, forma, laboratorio
    FROM public.productos
    WHERE activo = true
    ORDER BY id
  `);
  console.log(`Productos activos: ${productos.length}`);

  // Reset: la corrida es idempotente y autocorregible. Las fotos de corridas
  // anteriores (a veces con matching viejo/incorrecto) se limpian; solo quedan
  // las que este run asigne.
  const { rowCount: limpiados } = await client.query(
    `UPDATE public.productos SET foto_url = NULL WHERE activo = true AND foto_url IS NOT NULL`
  );
  console.log(`Fotos previas limpiadas: ${limpiados}`);

  const idx = construirIndice(productos);
  console.log('Indice COBECA construido');

  let matched = 0, sinMatch = 0, noFarmaco = 0;
  const updates = [];

  for (const foto of conImagen) {
    const parsed = parsearDescripcion(foto.desc_articulo);
    parsed._raw = foto.desc_articulo;
    if (!parsed.forma) { noFarmaco++; sinMatch++; continue; }

    const candidatos = candidatosPara(parsed, idx);
    let best = null;
    let bestScore = UMBRAL;

    for (const p of candidatos) {
      const s = matchScore(parsed, p);
      if (s > bestScore) { bestScore = s; best = p; }
    }

    if (best) {
      for (const p of candidatos) {
        if (!tieneAncla(parsed, p)) continue;
        const sp = matchScore(parsed, p);
        if (sp > bestScore) { bestScore = sp; best = p; }
      }
    }

    if (best && bestScore >= UMBRAL) {
      updates.push({ productoId: best.id, fotoUrl: foto.imagen, score: bestScore, desc: foto.desc_articulo });
      matched++;
    } else {
      sinMatch++;
    }
  }

  console.log(`\nResultados del matching:`);
  console.log(`  Matched: ${matched}`);
  console.log(`  Sin match: ${sinMatch}`);
  console.log(`  No farmaco: ${noFarmaco}`);

  // Dedupe: por producto, mantener SOLO la foto con mejor score (varias filas
  // COBECA pueden matchear el mismo producto y el UPDATE unnest sería indeterminado).
  const mejoresPorProducto = new Map();
  for (const u of updates) {
    const actual = mejoresPorProducto.get(u.productoId);
    if (!actual || u.score > actual.score) {
      mejoresPorProducto.set(u.productoId, u);
    }
  }
  const updatesUnicos = [...mejoresPorProducto.values()];
  console.log(`Productos unicos con foto: ${updatesUnicos.length}`);

  // Actualizar en BD usando parameterized batch
  let actualizados = 0;
  for (let i = 0; i < updatesUnicos.length; i += CHUNK) {
    const chunk = updatesUnicos.slice(i, i + CHUNK);
    // Build VALUES for unnest
    const ids = [];
    const urls = [];
    for (const u of chunk) {
      ids.push(u.productoId);
      urls.push(u.fotoUrl);
    }
    const sql = `
      UPDATE public.productos AS p
      SET foto_url = v.url
      FROM (SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS url) AS v
      WHERE p.id = v.id
    `;
    const { error, rowCount } = await client.query(sql, [ids, urls]);
    if (error) console.error(`Error chunk ${i}:`, error.message);
    else actualizados += rowCount;
    console.log(`  Procesados: ${Math.min(i + CHUNK, updatesUnicos.length)}/${updatesUnicos.length} (actualizados: ${actualizados})`);
  }

  console.log(`\nTotal actualizados: ${actualizados}`);

  // CSV de reporte
  const csvLines = ['producto_id,nombre_comercial,foto_url,score,desc_cobeca'];
  for (const u of updatesUnicos) {
    const p = productos.find(x => x.id === u.productoId);
    csvLines.push(`${u.productoId},"${(p?.nombre_comercial||'').replace(/"/g,'""')}","${u.fotoUrl}",${u.score.toFixed(3)},"${u.desc.replace(/"/g,'""')}"`);
  }
  fs.writeFileSync('data/fotos_cobeca_carga.csv', csvLines.join('\n'), 'utf-8');
  console.log('Reporte: data/fotos_cobeca_carga.csv');

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
