import pg from 'pg';
import fs from 'fs';
import { parsearDescripcion, matchScore } from './lib/cobecaParser.mjs';
import { config } from 'dotenv';
config();

const client = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const BRANDS = ['ANTAAR', 'ASTRIMOL', 'BIOTALOL', 'BISOPROLOL'];

async function main() {
  const fotos = JSON.parse(fs.readFileSync('data/fotos.json', 'utf8'));
  await client.connect();
  const { rows: productos } = await client.query(
    `SELECT id, nombre_comercial, molecula, forma, laboratorio, foto_url
     FROM public.productos WHERE activo = true ORDER BY id`
  );

  for (const brand of BRANDS) {
    const b = brand.toLowerCase();
    const dbProds = productos.filter(p => p.nombre_comercial && p.nombre_comercial.toLowerCase().includes(b));
    const fotosBrand = fotos.filter(f => f.desc_articulo && f.desc_articulo.toLowerCase().includes(b));

    console.log(`\n========== ${brand} ==========`);
    console.log(`--- PRODUCTOS DB (${dbProds.length}) ---`);
    for (const p of dbProds) {
      console.log(`  id=${p.id} | ${p.nombre_comercial} | mol=${p.molecula || '-'} | foto=${p.foto_url ? p.foto_url.split('/').pop() : 'SIN'}`);
    }
    console.log(`--- FOTOS COBECA (${fotosBrand.length}) ---`);
    for (const f of fotosBrand) {
      const parsed = parsearDescripcion(f.desc_articulo);
      console.log(`  ${f.cod_articulo} | ${f.desc_articulo} | parse: mol=${JSON.stringify(parsed.molTokens)} conc=${parsed.conc} conc2=${parsed.conc2} var=${parsed.variante}`);
    }
    // Scoring contra DB
    console.log(`--- SCORING ---`);
    for (const f of fotosBrand) {
      const ranked = dbProds
        .map(p => ({ p, s: matchScore(f.desc_articulo, p) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 2);
      console.log(`  ${f.cod_articulo} "${f.desc_articulo}" ->`);
      for (const { p, s } of ranked) {
        console.log(`     ${s.toFixed(3)} id=${p.id} ${p.nombre_comercial}`);
      }
    }
  }
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });