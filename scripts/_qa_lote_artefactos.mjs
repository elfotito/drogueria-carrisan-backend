import pg from "pg"; import dotenv from "dotenv";
dotenv.config();
const c = new pg.Client({ host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT) || 5432, database: process.env.SUPABASE_DB_NAME || "postgres", user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`SELECT id, nombre_comercial, precio_usd, costo_usd, disponible, updated_at FROM productos WHERE updated_at > NOW() - INTERVAL '6 hours' AND costo_usd IS NOT NULL AND ABS(precio_usd - round(costo_usd/0.6, 2)) > 0.001 ORDER BY updated_at DESC`);
console.log(`Artefactos del QA lote (precio <> costo/0.6 hoy): ${r.rows.length}`);
for (const p of r.rows) console.log(`${p.id}\t$ ${p.precio_usd}\tcosto ${p.costo_usd}\tdeberia ${Math.round(p.costo_usd/0.6*100)/100}\tdisp ${p.disponible}\t${(p.updated_at||"").toISOString?.()||p.updated_at}\t${p.nombre_comercial}`);
await c.end();
