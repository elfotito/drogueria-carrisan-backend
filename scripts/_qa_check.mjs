import pg from "pg"; import dotenv from "dotenv"; dotenv.config();
const { Client } = pg;
const c = new Client({ host: process.env.SUPABASE_DB_HOST, port: process.env.SUPABASE_DB_PORT||5432, database: process.env.SUPABASE_DB_NAME||"postgres", user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized:false } });
await c.connect();
const q = async (label, sql) => { const r = await c.query(sql); console.log("=== "+label+" ==="); console.log(JSON.stringify(r.rows,null,2)); };
await q("staff_rol_check def", `select pg_get_constraintdef(oid) as def from pg_constraint where conname='staff_rol_check'`);
await q("staff actuales", `select nombre, email, rol, activo from staff`);
await q("users qa insertados", `select id, email, nombre, tipo_usuario, activo from users where email like 'qa.%'`);
await c.end();
