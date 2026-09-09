import pg from "pg"; import dotenv from "dotenv"; import bcrypt from "bcrypt";
dotenv.config();
const { Client } = pg;
const c = new Client({ host: process.env.SUPABASE_DB_HOST, port: process.env.SUPABASE_DB_PORT||5432, database: process.env.SUPABASE_DB_NAME||"postgres", user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized:false } });
await c.connect();
const r = await c.query("select column_name, is_nullable, column_default, data_type from information_schema.columns where table_schema='public' and table_name='users' order by ordinal_position");
console.log(JSON.stringify(r.rows,null,2));
await c.end();
