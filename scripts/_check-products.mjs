import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({host:process.env.SUPABASE_DB_HOST,port:process.env.SUPABASE_DB_PORT||5432,database:process.env.SUPABASE_DB_NAME||'postgres',user:process.env.SUPABASE_DB_USER,password:process.env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect();
const r = await c.query(`SELECT id, nombre_comercial, molecula, forma FROM public.productos WHERE id IN (38853,38854,38855,39388,39389,39390,39391,39159,38822,39378,39380,39381,39377) ORDER BY id`);
for (const row of r.rows) console.log(`${row.id}|${row.nombre_comercial}|${row.molecula}|${row.forma}`);
await c.end();