import { Client } from 'pg';

const c = new Client({
  host: 'aws-1-us-west-2.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.fqeshthtycmzgyibiurq',
  password: 'carrisan1410'
});

function norm(s) {
  if (!s) return s;

  // 1. Unicode → ASCII, uppercase
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

  // 2. Quitar espacios dobles
  s = s.replace(/  +/g, ' ');

  // 3. Quitar espacio antes de coma
  s = s.replace(/ ,/g, ',');

  // 4. Quitar sufijos "/ VENEZUELA", "/ ECUADOR", "/ INDIA", etc.
  s = s.replace(/\s*\/\s*(VENEZUELA|ECUADOR|INDIA|ESPAÑA|COLOMBIA|URUGUAY|BRASIL|MEXICO|PERU|CHILE|ARGENTINA|PARAGUAY|ITALIA|ALEMANIA|FRANCIA|BANGLADESH|CHINA|COREA)\s*$/i, '');

  // 5. Quitar sufijos "/ PLANTA XXXX" y variantes
  s = s.replace(/\s*\/\s*PLANTA\s+[\w\s.,()-]+$/i, '');

  // 6. Quitar sufijo "(XXXXX)" al final (códigos postales, etc.)
  s = s.replace(/\s*\(\d+\)\s*$/, '');

  // 7. Prefijos duplicados: "X - X" → "X" (si X aparece dos veces)
  const dashParts = s.split(/\s+-\s+/);
  if (dashParts.length === 2) {
    const a = dashParts[0].replace(/[.,\s]+$/, '').trim();
    const b = dashParts[1].replace(/[.,\s]+$/, '').trim();
    if (a === b || a.startsWith(b) || b.startsWith(a)) {
      s = a;
    }
  }

  // 8. Normalizar abreviaturas de sociedad
  // S.A / S.A.S / C.A etc → agregar punto si falta
  s = s.replace(/\bS\.A\.S\b(?!\.)/g, 'S.A.S.');
  s = s.replace(/\bS\.A\b(?!\.)/g, 'S.A.');
  s = s.replace(/\bC\.A\b(?!\.)/g, 'C.A.');
  s = s.replace(/\bS\.A\.V\b(?!\.)/g, 'S.A.V.');
  s = s.replace(/\bS\.A\.C\.I\b(?!\.)/g, 'S.A.C.I.');
  s = s.replace(/\bS\.p\.A\b(?!\.)/g, 'S.p.A.');
  s = s.replace(/\bS\.A\.E\.C\.A\b(?!\.)/g, 'S.A.E.C.A.');
  s = s.replace(/\bS\.A\.U\b(?!\.)/g, 'S.A.U.');
  s = s.replace(/\bS\.R\.L\b(?!\.)/g, 'S.R.L.');
  s = s.replace(/\bPVT\s+LTD\b(?!\.)/g, 'PVT. LTD.');
  s = s.replace(/\bPVT\.\s*LTD\b(?!\.)/g, 'PVT. LTD.');
  s = s.replace(/\bPVT\.,\s*LTD\./g, 'PVT. LTD.');
  s = s.replace(/\bPVT\.?\s*LTD\.?\s*$/g, 'PVT. LTD.');
  s = s.replace(/\bLLC\b(?!\.)/g, 'LLC.');
  s = s.replace(/\bPLC\b(?!\.)/g, 'PLC.');
  s = s.replace(/\bAB\b(?!\.)/g, 'AB.');
  s = s.replace(/\bLTDA\b(?!\.)/g, 'LTDA.');
  s = s.replace(/\bCO\.\s*,?\s*LTD\.?\s*$/g, 'CO., LTD.');
  s = s.replace(/\bLIMITED\b(?!\.)/g, 'LIMITED');

  // 9. Quitar coma suelta antes de punto: "S.A, ." → "S.A."
  s = s.replace(/,(\s*\.)+/g, '.');

  // 10. Quitar punto suelto al final
  s = s.replace(/\.\s*$/, '.');

  // 11. Eliminar doble punto
  s = s.replace(/\.\./g, '.');

  // 12. Quitar coma final
  s = s.replace(/,\s*$/, '');

  // 13. Quitar espacios alrededor de puntos en abreviaturas
  s = s.replace(/(\w)\.\s+(\w)\./g, '$1. $2.');

  // 14. Limpiar espacios finales
  s = s.trim();

  return s;
}

(async () => {
  await c.connect();

  // Obtener todos los laboratorios de AMBAS tablas
  const labs1 = await c.query(`
    SELECT DISTINCT laboratorio FROM productos WHERE laboratorio IS NOT NULL AND laboratorio <> ''
  `);
  const labs2 = await c.query(`
    SELECT DISTINCT laboratorio FROM productos_catalogo WHERE laboratorio IS NOT NULL AND laboratorio <> ''
  `);

  // Unir todos sin duplicados
  const todos = new Set([
    ...labs1.rows.map(r => r.laboratorio),
    ...labs2.rows.map(r => r.laboratorio)
  ]);

  // Calcular normalización
  const cambios = [];
  for (const original of [...todos].sort()) {
    const normalizado = norm(original);
    if (normalizado !== original) {
      cambios.push({ original, normalizado });
    }
  }

  console.log('=== RESUMEN ===');
  console.log('Laboratorios totales (únicos):', todos.size);
  console.log('Con cambios necesarios:', cambios.length);
  console.log('Sin cambios:', todos.size - cambios.length);

  if (cambios.length > 0) {
    console.log('');
    console.log('=== CAMBIOS A APLICAR ===');
    for (const { original, normalizado } of cambios) {
      console.log('  "' + original + '"');
      console.log('    → "' + normalizado + '"');
      console.log('');
    }
  }

  await c.end();
})();
