import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({host:process.env.SUPABASE_DB_HOST,port:process.env.SUPABASE_DB_PORT||5432,database:process.env.SUPABASE_DB_NAME||'postgres',user:process.env.SUPABASE_DB_USER,password:process.env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect();
const q = `SELECT id, nombre_comercial, molecula, forma, foto_url FROM public.productos WHERE activo=true AND (nombre_comercial ILIKE '%TACHIGRIP%' OR nombre_comercial ILIKE 'TACHIPIRIN 2%') ORDER BY id`;
const r = await c.query(q);
for (const x of r.rows) console.log(`${x.id}|${x.nombre_comercial}|${x.molecula}|${x.forma}|${x.foto_url || 'SIN'}`);
await c.end();