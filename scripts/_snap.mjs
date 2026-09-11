import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({host:process.env.SUPABASE_DB_HOST,port:process.env.SUPABASE_DB_PORT||5432,database:process.env.SUPABASE_DB_NAME||'postgres',user:process.env.SUPABASE_DB_USER,password:process.env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect();
const r = await c.query(`SELECT id, foto_url FROM public.productos WHERE activo=true AND foto_url IS NOT NULL ORDER BY id`);
import fs from 'fs';
fs.writeFileSync('data/_snapshot_fotos_before_volfix.csv', r.rows.map(x => `${x.id},${x.foto_url}`).join('\n'));
console.log('snapshot:'+r.rows.length);