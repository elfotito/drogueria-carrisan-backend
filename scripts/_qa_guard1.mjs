import pg from "pg"; import dotenv from "dotenv"; dotenv.config();
const { Client } = pg;
const c = new Client({ host: process.env.SUPABASE_DB_HOST, port: process.env.SUPABASE_DB_PORT||5432, database: process.env.SUPABASE_DB_NAME||"postgres", user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized:false } });
await c.connect();
const u = await c.query(`update productos set disponible = true where id = 38890 returning id, precio_usd, disponible`);
console.log("TRAMAL publicado sin precio:", JSON.stringify(u.rows[0]));
await c.end();
