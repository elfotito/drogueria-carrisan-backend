// scripts/completar-atc.mjs
// Task B — Completar ATC faltantes en moleculas_referencias.
// 1) Clasifica las 1,471 moléculas sin atc_id contra atc_clasificaciones (nivel 5).
// 2) Escribe data/moleculas_sin_atc_<fecha>.csv (decisión del dueño).
// 3) Escribe data/moleculas_atc_updates.sql con los UPDATEs "auto" (ojalá 0)
//    para que el dueño los aplique en Supabase (regla: no tocar BD sin aprobación).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PIPELINE } from './moleculaDuplicados.mjs';
import { clasificar, filaCsv, CSV_HEADER } from './completarAtc.mjs';

const { normName, levenshtein } = PIPELINE;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hoy = '2026-09-09';

const dump = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'moleculas_referencias_dump.json'), 'utf-8'));
const atcCSV = fs.readFileSync(path.join(ROOT, 'data', 'atc_clasificaciones_import.csv'), 'utf-8');

const atc = atcCSV.trim().split('\n').slice(1).map((l) => {
  const i = l.indexOf(',');
  const resto = l.slice(i + 1);
  const j = resto.indexOf(',');
  return { codigo: l.slice(0, i), nombre: resto.slice(0, j), nivel: Number(resto.slice(j + 1).split(',')[0]) };
});
const nivel5 = atc.filter((a) => a.nivel === 5);

const sinAtc = dump.filter((m) => !m.atc_id);
console.log(`Moléculas sin atc_id: ${sinAtc.length} | ATC nivel 5: ${nivel5.length}`);

const deps = { normTokenFn: normName, levenshteinFn: levenshtein };

// Falsos positivos conocidos: score alta pero NO son la misma molécula
// (nombres parecidos a fármacos distintos). Van a "revisar" para el dueño.
const DENY = new Set([
  'Oxidronico Acido',         // -> Acido etidronico (distinto)
  'Simoctocog Alfa',          // -> Susoctocog alfa (distinto)
  'Turoctocog Alfa',          // -> Susoctocog alfa (distinto)
  'Sodio Carbonato',          // -> Sodio bicarbonato (distinto)
  'Nicotamida',               // -> Picotamida (distinto)
  'Glipentida',               // -> Glisentida (distinto)
  'Simeticona',               // -> Dimeticona (distinta)
]);

const filas = [];
const conteo = { auto: 0, revisar: 0, sin_candidato: 0 };
const clasificados = new Map();

for (const m of sinAtc) {
  let c = clasificar(m, nivel5, deps);
  if (c.estado === 'auto' && DENY.has(m.nombre)) {
    c = { ...c, estado: 'revisar' };
  }
  clasificados.set(m.id, c);
  conteo[c.estado]++;
  filas.push(filaCsv(m, c));
}

const csvPath = path.join(ROOT, 'data', `moleculas_sin_atc_${hoy}.csv`);
fs.writeFileSync(csvPath, CSV_HEADER + '\n' + filas.join('\n') + '\n', 'utf-8');
console.log(`CSV -> ${csvPath}`);
console.log(`Resumen: ${JSON.stringify(conteo)}`);

// SQL de actualización para los "auto" (aplicables a mano).
const sqlescape = (v) => "'" + String(v).replace(/'/g, "''") + "'";
const updates = [];
for (const m of sinAtc) {
  const c = clasificados.get(m.id);
  if (c.estado === 'auto' && c.candidato) {
    updates.push(`UPDATE moleculas_referencias SET atc_id = (SELECT id FROM atc_clasificaciones WHERE codigo = ${sqlescape(c.candidato.codigo)})
WHERE nombre = ${sqlescape(m.nombre)};`);
  }
}
const sqlPath = path.join(ROOT, 'data', `moleculas_atc_updates_${hoy}.sql`);
fs.writeFileSync(sqlPath, updates.join('\n') + '\n', 'utf-8');
console.log(`SQL (${updates.length} updates auto) -> ${sqlPath}`);

// Mostrar los "auto" que irán al SQL
console.log('\n--- candidatos AUTO (id | nombre -> ATC grado) ---');
for (const m of sinAtc) {
  const c = clasificados.get(m.id);
  if (c.estado === 'auto') {
    console.log(`${m.id} | ${m.nombre}  ->  ${c.candidato.codigo} ${c.candidato.nombre} (${c.candidato.score})`);
  }
}