import 'dotenv/config';
import pg from 'pg';

const DB_CONFIG = {
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
};

const EXPECTED = {
  'ANTAAR 25 mg X 10 COMPRIMIDOS RECUBIERTOS': '5289',
  'ANTAAR/HCT TAB 5MG/6,25MG X30': '5284',
  'ASTRIMOL COMPRIMIDOS RECUBIERTOS': '5505',
  'BIOTALOL HCT 12.5/5 MG': '5535',
  'BISOPROLOL FUMARATO 10 mg X 30 COMPRIMIDOS': '5564',
  'CORENTEL H 5 MG X 14 TABLETAS RECUBIERTAS': '5958',
  'CORENTEL H 5 MG X 28 TABLETAS RECUBIERTAS': '5958',
  'CORENTEL H 10 MG X 14 TABLETAS RECUBIERTAS': '5959',
  'CORENTEL H 10 MG X 28 TABLETAS RECUBIERTAS': '5959',
};

const client = new pg.Client(DB_CONFIG);
await client.connect();
const r = await client.query(`
  SELECT id, nombre_comercial, foto_url
  FROM public.productos
  WHERE activo = true AND nombre_comercial IN (${Object.keys(EXPECTED).map((_, i) => `$${i + 1}`).join(',')})
  ORDER BY id
`, Object.keys(EXPECTED));
await client.end();

let regressions = 0;
for (const row of r.rows) {
  const lastSlash = row.foto_url?.lastIndexOf('/');
  const fotoId = lastSlash ? row.foto_url.substring(lastSlash + 1).replace('.jpg', '') : 'SIN';
  const expectedFotoId = EXPECTED[row.nombre_comercial];
  const ok = fotoId === expectedFotoId;
  if (!ok) regressions++;
  console.log(`${ok ? 'OK' : 'REGRESSION'} | ${row.id} | ${row.nombre_comercial.substring(0,55)} | got=${fotoId} expected=${expectedFotoId}`);
}
console.log(`\nRegressions: ${regressions}`);