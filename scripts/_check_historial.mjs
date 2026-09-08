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

const tablas = ['ordenes','presupuestos','cotizaciones','requerimientos','valoraciones','favoritos','listas','listas_items','alertas_disponibilidad','descuentos','producto_costos','producto_moleculas','producto_detalles','carrito'];
// carrito no existe como tabla? revisar
for (const t of tablas) {
  try {
    const r = await client.query(`SELECT count(*) AS n FROM public.${t}`);
    console.log(`${t.padEnd(22)} ${r.rows[0].n}`);
  } catch (e) {
    // buscar si existe
    const ex = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [t]);
    console.log(`${t.padEnd(22)} [${ex.rows.length ? 'existe, sin count' : 'NO EXISTE'}]`);
  }
}

// Cuántos productos tienen refere en historial
const ordenesItems = await client.query(`SELECT count(DISTINCT producto_id) AS n FROM public.ordenes_items`);
console.log(`\nordenes_items productos distintos:`, ordenesItems.rows[0].n);
const presup = await client.query(`SELECT count(DISTINCT producto_id) AS n FROM public.presupuesto_items`);
console.log(`presupuesto_items productos distintos:`, presup.rows[0].n);

// cuántos productos hay ahora (con fuente INHRR y demo)
const prods = await client.query(`
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE fuente_inhrr_ef IS NOT NULL) AS inhrr,
    count(*) FILTER (WHERE fuente_inhrr_ef IS NULL) AS demo,
    count(*) FILTER (WHERE costo_usd IS NOT NULL) AS con_costo,
    count(*) FILTER (WHERE disponible) AS disponibles
  FROM public.productos`);
console.log('\nPRODUCTOS:', JSON.stringify(prods.rows[0]));

await client.end();