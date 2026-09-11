import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({host:process.env.SUPABASE_DB_HOST,port:process.env.SUPABASE_DB_PORT||5432,database:process.env.SUPABASE_DB_NAME||'postgres',user:process.env.SUPABASE_DB_USER,password:process.env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect();
const r1 = await c.query(`SELECT COUNT(*)::int AS con_foto, (SELECT COUNT(*)::int FROM public.productos WHERE activo=true) AS total FROM public.productos WHERE activo=true AND foto_url IS NOT NULL`);
console.log(`Productos activos: ${r1.rows[0].total}`);
console.log(`Con foto: ${r1.rows[0].con_foto}`);
console.log(`Sin foto: ${r1.rows[0].total - r1.rows[0].con_foto}`);

const r2 = await c.query(`
  SELECT p.id, p.nombre_comercial, p.forma
  FROM public.productos p
  WHERE p.activo = true AND p.foto_url IS NULL
    AND (p.nombre_comercial ILIKE '%TERAGRIP%' OR p.nombre_comercial ILIKE '%TACHIPIRIN%' OR p.nombre_comercial ILIKE '%TACHIGRIP%')
  ORDER BY p.id
`);
for (const row of r2.rows) console.log(`SIN: ${row.id} | ${row.nombre_comercial} | ${row.forma}`);
await c.end();