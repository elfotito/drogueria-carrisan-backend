import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';

const rows = fs.readFileSync('data/_snapshot_fotos_before_volfix.csv', 'utf8').trim().split('\n')
  .map(l => { const [id, url] = l.split(','); return { id: Number(id), url }; });
const before = new Map(rows.map(r => [r.id, r.url]));

const c = new pg.Client({host:process.env.SUPABASE_DB_HOST,port:process.env.SUPABASE_DB_PORT||5432,database:process.env.SUPABASE_DB_NAME||'postgres',user:process.env.SUPABASE_DB_USER,password:process.env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect();
const r = await c.query(`SELECT id, foto_url, nombre_comercial FROM public.productos WHERE activo=true ORDER BY id`);
await c.end();

let lost = [], changed = [], gained = 0;
for (const row of r.rows) {
  const prev = before.get(row.id);
  if (prev && !row.foto_url) lost.push(row);
  else if (prev && prev !== row.foto_url) changed.push({ ...row, prev });
  else if (!prev && row.foto_url) gained++;
}
console.log(`Regresiones (tenía foto → sin): ${lost.length}`);
for (const l of lost) console.log(`  LOST ${l.id} ${l.nombre_comercial.substring(0,50)}`);
console.log(`Cambios de foto: ${changed.length}`);
for (const ch of changed) console.log(`  CHG ${ch.id} ${(ch.prev||'').split('/').pop()} -> ${(ch.foto_url||'').split('/').pop()} ${ch.nombre_comercial.substring(0,50)}`);
console.log(`Fotos ganadas: ${gained}`);
console.log(`Total antes: ${before.size} ahora: ${r.rows.filter(x=>x.foto_url).length}`);