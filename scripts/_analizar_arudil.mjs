import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const client = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});
await client.connect();

const cols = await client.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='producto_detalles' ORDER BY ordinal_position
`);
console.log('=== COLUMNAS producto_detalles ===');
for (const r of cols.rows) console.log(`${r.column_name} (${r.data_type})`);

const ej = await client.query(`
  SELECT pd.*, p.nombre_comercial FROM public.producto_detalles pd
  JOIN public.productos p ON p.id = pd.producto_id
  LIMIT 5
`);
console.log('\n=== Ejemplo producto_detalles ===');
for (const r of ej.rows) console.log(JSON.stringify(r));

// Cuantos productos tienen detalles
const cnt = await client.query(`SELECT count(*) FROM public.producto_detalles`);
console.log('\ncount producto_detalles:', cnt.rows[0].count);

// Buscar ARUDIL en productos y en el catalogo INHRR
const arudil = await client.query(`SELECT id, nombre_comercial, molecula, forma, laboratorio, costo_usd, precio_usd FROM public.productos WHERE nombre_comercial ILIKE '%ARUDIL%'`);
console.log('\n=== ARUDIL en productos ===');
for (const r of arudil.rows) console.log(JSON.stringify(r));

const arudilCat = await client.query(`SELECT id, sku, ef, nombre, forma, principio_activo, fabricante FROM public.productos_catalogo WHERE nombre ILIKE '%ARUDIL%' OR principio_activo ILIKE '%ARUDIL%'`);
console.log('\n=== ARUDIL en productos_catalogo (INHRR) ===');
for (const r of arudilCat.rows) console.log(JSON.stringify(r));

// ARUDIL en COBECA (del reporte? no DB). Veamos si hay filas COBECA/Drovencentro con presentaciones distintas - mainly check producto_costos por ARUDIL
const arudilCostos = await client.query(`
  SELECT pc.proveedor, pc.producto_id, pc.costo_usd, p.nombre_comercial, p.fuente_inhrr_ef
  FROM public.producto_costos pc JOIN public.productos p ON p.id=pc.producto_id
  WHERE p.nombre_comercial ILIKE '%ARUDIL%'
`);
console.log('\n=== producto_costos para ARUDIL ===');
for (const r of arudilCostos.rows) console.log(JSON.stringify(r));

await client.end();