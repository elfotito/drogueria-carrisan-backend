import pg from "pg"; import dotenv from "dotenv"; dotenv.config();
const { Client } = pg;
const c = new Client({ host: process.env.SUPABASE_DB_HOST, port: process.env.SUPABASE_DB_PORT||5432, database: process.env.SUPABASE_DB_NAME||"postgres", user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized:false } });
await c.connect();
const r = await c.query("select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='staff' order by ordinal_position");
console.log(JSON.stringify(r.rows,null,2));
const u = await c.query("select id, email, nombre, es_admin, activo, tipo_usuario, etiqueta from users");
console.log(JSON.stringify(u.rows,null,2));
await c.end();
