import pg from 'pg';
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

await client.connect();
const { rows } = await client.query(
  `SELECT id, nombre_comercial, foto_url
   FROM public.productos
   WHERE activo = true
     AND (nombre_comercial ILIKE '%ANTAAR%' OR nombre_comercial ILIKE '%ASTRIMOL%'
          OR nombre_comercial ILIKE '%BIOTALOL%' OR nombre_comercial ILIKE '%BISOPROLOL%'
          OR nombre_comercial ILIKE '%CORENTEL%')
   ORDER BY id`
);
for (const r of rows) {
  console.log(r.id + ' | ' + r.nombre_comercial + ' | ' + (r.foto_url ? r.foto_url.split('/').pop() : 'SIN'));
}
await client.end();