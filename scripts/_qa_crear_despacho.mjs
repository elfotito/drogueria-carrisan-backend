import pg from "pg"; import dotenv from "dotenv"; import bcrypt from "bcrypt";
dotenv.config();
const { Client } = pg;
const c = new Client({ host: process.env.SUPABASE_DB_HOST, port: process.env.SUPABASE_DB_PORT||5432, database: process.env.SUPABASE_DB_NAME||"postgres", user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized:false } });
await c.connect();
const h = await bcrypt.hash("QA.Despacho.2026", 10);
const s = await c.query(`insert into staff (nombre, email, password_hash, rol, activo) values ($1,$2,$3,$4,true) returning id, email, rol`, ["QA Despachador Test", "qa.despachador@carrisan.test", h, "despachador"]);
console.log("DESPACHADOR:", JSON.stringify(s.rows[0]));
await c.end();
