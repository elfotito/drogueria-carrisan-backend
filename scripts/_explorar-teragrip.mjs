import pg from 'pg';
import fs from 'fs';
import { config } from 'dotenv';
config();

async function main() {
  const client = new pg.Client({
    host: process.env.SUPABASE_DB_HOST,
    port: process.env.SUPABASE_DB_PORT || 5432,
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER,
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log('===== PRODUCTOS DB (TERAGRIP / TACHIGRIP / TACHIPIRIN) =====');
  const { rows } = await client.query(
    `SELECT id, nombre_comercial, molecula, forma, laboratorio, foto_url
     FROM public.productos
     WHERE activo = true
       AND (nombre_comercial ILIKE '%TERAGRIP%' OR nombre_comercial ILIKE '%TACHIGRIP%'
            OR nombre_comercial ILIKE '%TACHIPIRIN%' OR nombre_comercial ILIKE '%TACHIPIRINA%')
     ORDER BY id`
  );
  for (const r of rows) {
    console.log(`${r.id} | ${r.nombre_comercial} | mol=${r.molecula?.slice(0, 60)} | forma=${r.forma} | foto=${r.foto_url ? 'SI' : 'SIN'}`);
  }

  console.log('\n===== DESCS COBECA (TERAGRIP / TACHI) =====');
  const fotos = JSON.parse(fs.readFileSync('data/fotos.json', 'utf-8'));
  const hits = fotos.filter(f => /TERAGRIP|TACHIGRIP|TACHIPIRIN|TACHIPIRINA|TACHI\b/i.test(f.desc_articulo || ''));
  for (const f of hits) {
    console.log(`[${f.cod_articulo}] ${f.desc_articulo} | img=${f.imagen ? f.imagen.split('/').pop() : 'SIN'}`);
  }
  console.log(`Total hits: ${hits.length}`);
  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });