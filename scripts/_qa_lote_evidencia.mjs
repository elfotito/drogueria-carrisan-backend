import pg from "pg"; import dotenv from "dotenv";
dotenv.config();
const c = new pg.Client({ host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT) || 5432, database: process.env.SUPABASE_DB_NAME || "postgres", user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`SELECT id, nombre_comercial, precio_usd, costo_usd, disponible, updated_at FROM productos WHERE precio_usd IS NOT NULL AND precio_usd < 1.00 ORDER BY updated_at DESC LIMIT 25`);
console.log("Productos con precio < $1 (posibles artefactos del QA lote):");
for (const p of r.rows) console.log(`${p.id}\t$ ${p.precio_usd}\tcosto ${p.costo_usd}\tdisp ${p.disponible}\tupdated ${(p.updated_at||"").toISOString?.()||p.updated_at}\t${p.nombre_comercial}`);
await c.end();
