import pg from "pg"; import dotenv from "dotenv"; dotenv.config();
const { Client } = pg;
const c = new Client({ host: process.env.SUPABASE_DB_HOST, port: process.env.SUPABASE_DB_PORT||5432, database: process.env.SUPABASE_DB_NAME||"postgres", user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized:false } });
await c.connect();
const ins = await c.query(`insert into alertas_disponibilidad (usuario_id, producto_id, notificado) values (4, 38890, false) on conflict do nothing returning id`);
console.log("alerta insertada:", JSON.stringify(ins.rows[0]));
await c.end();
