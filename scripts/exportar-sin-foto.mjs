import pg from 'pg';
import fs from 'fs';
import { config } from 'dotenv';
config();

const client = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432), database: 'postgres',
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(
  `SELECT id, sku, nombre_comercial, molecula, forma, laboratorio, presentacion, unidades_por_presentacion, costo_usd, precio_usd, disponible
     FROM public.productos
    WHERE activo = true AND foto_url IS NULL
    ORDER BY id`
);

const esc = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const header = 'id,sku,nombre_comercial,molecula,forma,laboratorio,presentacion,unidades_por_presentacion,costo_usd,precio_usd,disponible';
const lines = rows.map((r) =>
  [r.id, r.sku, r.nombre_comercial, r.molecula, r.forma, r.laboratorio, r.presentacion, r.unidades_por_presentacion, r.costo_usd, r.precio_usd, r.disponible].map(esc).join(',')
);

fs.writeFileSync('data/productos_sin_foto_2026-09-11.csv', [header, ...lines].join('\n'), 'utf-8');
console.log(`Exportados ${rows.length} productos sin foto a data/productos_sin_foto_2026-09-11.csv`);
await client.end();