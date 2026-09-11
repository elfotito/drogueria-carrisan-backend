import { Client } from 'pg';
const c = new Client({
  host: 'aws-1-us-west-2.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.fqeshthtycmzgyibiurq',
  password: 'carrisan1410'
});

function normalizar(str) {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,;:!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

(async () => {
  await c.connect();

  // Todos los laboratorios de productos (tienda) con conteo
  const labsTienda = await c.query(`
    SELECT laboratorio, COUNT(*) n
    FROM productos
    WHERE laboratorio IS NOT NULL AND laboratorio <> ''
    GROUP BY laboratorio
    ORDER BY laboratorio
  `);

  // Todos los laboratorios de productos_catalogo (INHRR)
  const labsCatalogo = await c.query(`
    SELECT laboratorio, COUNT(*) n
    FROM productos_catalogo
    WHERE laboratorio IS NOT NULL AND laboratorio <> ''
    GROUP BY laboratorio
    ORDER BY laboratorio
  `);

  console.log('=== LABORATORIOS EN TIENDA (productos) ===');
  console.log('Total distintos:', labsTienda.rows.length);
  labsTienda.rows.forEach(r => console.log('  "' + r.laboratorio + '" (' + r.n + ')'));

  console.log('');
  console.log('=== LABORATORIOS EN INHRR (productos_catalogo) ===');
  console.log('Total distintos:', labsCatalogo.rows.length);

  // Encontrar variantes del mismo laboratorio
  console.log('');
  console.log('=== VARIANTES DETECTADAS (mismo nombre normalizado, distinto original) ===');
  const mapa = {};
  for (const r of labsTienda.rows) {
    const key = normalizar(r.laboratorio);
    if (!mapa[key]) mapa[key] = [];
    mapa[key].push({ original: r.laboratorio, count: r.n });
  }
  const duplicados = Object.entries(mapa).filter(([k, v]) => v.length > 1);
  console.log('Grupos con variantes:', duplicados.length);
  for (const [key, variants] of duplicados) {
    console.log('');
    console.log('  Grupo (normalizado: "' + key + '"):');
    variants.forEach(v => console.log('    "' + v.original + '" → ' + v.n + ' productos'));
  }

  // Laboratorios en tienda que NO están en catálogo (diferencia)
  const labsCatalogoSet = new Set(labsCatalogo.rows.map(r => normalizar(r.laboratorio)));
  const tiendaSinCatalogo = labsTienda.rows.filter(r => !labsCatalogoSet.has(normalizar(r.laboratorio)));
  if (tiendaSinCatalogo.length > 0) {
    console.log('');
    console.log('=== LABS EN TIENDA QUE NO EXISTEN EN CATÁLOGO (diferente normalización?) ===');
    tiendaSinCatalogo.forEach(r => console.log('  "' + r.laboratorio + '" (' + r.n + ')'));
  }

  await c.end();
})();
