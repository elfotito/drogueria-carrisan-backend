import pg from "pg"; import dotenv from "dotenv"; import bcrypt from "bcrypt";
dotenv.config();
const { Client } = pg;
const c = new Client({ host: process.env.SUPABASE_DB_HOST, port: process.env.SUPABASE_DB_PORT||5432, database: process.env.SUPABASE_DB_NAME||"postgres", user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized:false } });
await c.connect();

const pass = { cliente: "QA.Cliente.2026", vendedor: "QA.Vendedor.2026", almacen: "QA.Almacen.2026" };
const h1 = await bcrypt.hash(pass.cliente, 10);
const h2 = await bcrypt.hash(pass.vendedor, 10);
const h3 = await bcrypt.hash(pass.almacen, 10);

const u = await c.query(`insert into users (email, password_hash, nombre, etiqueta, activo, token_version, tipo_usuario, estado, ciudad)
  values ($1,$2,$3,$4,true,0,$5,$6,$7) returning id, email, tipo_usuario`, ["qa.cliente@carrisan.test", h1, "QA Cliente Test", "profesional", "profesional", "activo", "Valencia"]);

const s1 = await c.query(`insert into staff (nombre, email, password_hash, rol, activo) values ($1,$2,$3,$4,true) returning id, email, rol`, ["QA Vendedor Test", "qa.vendedor@carrisan.test", h2, "vendedor"]);
const s2 = await c.query(`insert into staff (nombre, email, password_hash, rol, activo) values ($1,$2,$3,$4,true) returning id, email, rol`, ["QA Almacenista Test", "qa.almacenista@carrisan.test", h3, "almacenista"]);

console.log("CLIENTE:", JSON.stringify(u.rows[0]), "pass:", pass.cliente);
console.log("VENDEDOR:", JSON.stringify(s1.rows[0]), "pass:", pass.vendedor);
console.log("ALMACEN:", JSON.stringify(s2.rows[0]), "pass:", pass.almacen);
await c.end();
