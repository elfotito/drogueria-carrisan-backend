import pg from "pg"; import dotenv from "dotenv"; dotenv.config();
const { Client } = pg;
const c = new Client({ host: process.env.SUPABASE_DB_HOST, port: process.env.SUPABASE_DB_PORT||5432, database: process.env.SUPABASE_DB_NAME||"postgres", user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized:false } });
await c.connect();
const cols = await c.query(`select column_name, is_nullable, column_default, data_type from information_schema.columns where table_name='productos' order by ordinal_position`);
console.log("COLUMNAS:"); console.log(cols.rows.map(r=>`  ${r.column_name} | null=${r.is_nullable} | def=${r.column_default} | ${r.data_type}`).join("\n"));
const chk = await c.query(`select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='productos'::regclass and contype in ('c','u')`);
console.log("CHECKS/UNIQUE:"); console.log(chk.rows.map(r=>`  ${r.conname}: ${r.pg_get_constraintdef}`).join("\n"));
await c.end();
