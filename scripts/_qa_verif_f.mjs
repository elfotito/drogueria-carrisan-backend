import pg from "pg"; import dotenv from "dotenv"; dotenv.config();
const { Client } = pg;
const c = new Client({ host: process.env.SUPABASE_DB_HOST, port: process.env.SUPABASE_DB_PORT||5432, database: process.env.SUPABASE_DB_NAME||"postgres", user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized:false } });
await c.connect();
const a = await c.query(`select id, notificado from alertas_disponibilidad where usuario_id=4 and producto_id=38890`);
console.log("alerta:", JSON.stringify(a.rows));
const n = await c.query(`select id, tipo, titulo, usuario_id, leido from notificaciones where usuario_id=4 order by created_at desc limit 5`);
console.log("notificaciones:", JSON.stringify(n.rows));
await c.end();
