import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;
const db = {
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
};

const c = new Client(db);
await c.connect();

const q = async (label, sql, params) => {
  const r = await c.query(sql, params);
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(r.rows, null, 2));
};

await q('TOTAL productos activos', `select count(*)::int as n from productos where activo = true`);
await q('Visible catalogo', `select count(*)::int as n from productos where visible_catalogo = true and activo = true`);
await q('Con precio > 0', `select count(*)::int as n from productos where precio_usd > 0`);
await q('Sin precio (NULL)', `select count(*)::int as n from productos where precio_usd is null and activo = true and visible_catalogo = true`);
await q('Precio>0 y disponible=false (invariante, debe ser 0)', `select count(*)::int as n from productos where precio_usd > 0 and disponible = false`);
await q('disponible=true con precio NULL/0 (debe ser 0)', `select count(*)::int as n from productos where disponible = true and (precio_usd is null or precio_usd = 0)`);
await q('Bridge producto_moleculas', `select count(*)::int as n from producto_moleculas`);

await q('Productos sin precio de muestra (5)', `
  select id, nombre_comercial, sku, laboratorio, forma, linea
  from productos
  where activo = true and visible_catalogo = true and precio_usd is null
  order by nombre_comercial
  limit 5`);

await q('Buscar TRAMAL/TRAMADOL en tienda', `
  select id, nombre_comercial, sku, precio_usd, disponible, laboratorio
  from productos
  where nombre_comercial ilike '%trama%' or molecula ilike '%tramadol%'
  limit 10`);

await q('RPC productos_por_atc(2,N02) via funcion', `
  select count(*)::int as n from public.productos_por_atc(2, 'N02')`);

await q('Ejemplo RPC N01 (Anestesicos)', `
  select p.nombre_comercial, p.sku from public.productos_por_atc(2, 'N01') p limit 5`);

await q('Laboratorios en metadata (sample)', `
  select laboratorio, count(*)::int as n from productos
  where laboratorio is not null and laboratorio <> '' and activo = true
  group by laboratorio order by n desc limit 5`);

await q('Un producto con molecula enlazada sin precio', `
  select p.id, p.nombre_comercial, p.sku, p.forma, m.nombre as molecula
  from productos p
  join producto_moleculas pm on pm.producto_id = p.id
  join moleculas_referencias m on m.id = pm.molecula_id
  where p.precio_usd is null and p.activo = true and p.visible_catalogo = true
  order by p.nombre_comercial
  limit 5`);

await q('Conteo de ordenes (contexto)', `select count(*)::int as ordenes, count(*) filter (where creado_por_staff_id is not null)::int as staff_orders from ordenes`);

await c.end();
console.log('\nFIN');