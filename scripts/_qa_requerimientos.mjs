import pg from "pg"; import dotenv from "dotenv"; dotenv.config();
const { Client } = pg;
const c = new Client({ host: process.env.SUPABASE_DB_HOST, port: process.env.SUPABASE_DB_PORT||5432, database: process.env.SUPABASE_DB_NAME||"postgres", user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized:false } });
await c.connect();
const cols = await c.query(`select column_name, data_type, is_nullable from information_schema.columns where table_name in ('requerimientos','requerimiento_items') order by table_name, ordinal_position`);
console.log("COLUMNAS:"); console.log(cols.rows.map(r=>`  ${r.table_name} > ${r.column_name} ${r.data_type} null=${r.is_nullable}`).join("\n"));
const reqs = await c.query(`select id, usuario_id, estado, fecha_solicitud from requerimientos order by id desc limit 5`);
console.log("REQUERIMIENTOS:"); console.log(JSON.stringify(reqs.rows));
if (reqs.rows.length) {
  const ra = await c.query(`select * from requerimiento_items where requerimiento_id = $1 order by id`, [reqs.rows[0].id]);
  console.log("ITEMS (ultimo req):"); console.log(JSON.stringify(ra.rows, null, 1));
}
await c.end();
