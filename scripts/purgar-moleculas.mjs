// scripts/purgar-moleculas.mjs
// Genera el reporte de duplicados de moleculas_referencias para revisión del
// dueño. NO modifica la BD — solo CSVs de decisión (regla: fusión SOLO con
// aprobación explícita del dueño).
//
// Entrada: data/moleculas_referencias_dump.json (generado por _dump_moleculas.mjs)
// Salidas: data/moleculas_duplicados_<fecha>.csv
// Uso: node scripts/purgar-moleculas.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectarDuplicados } from './moleculaDuplicados.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DUMP = path.join(ROOT, 'data', 'moleculas_referencias_dump.json');
const hoy = new Date().toISOString().slice(0, 10);
const OUT = path.join(ROOT, 'data', `moleculas_duplicados_${hoy}.csv`);

const moleculas = JSON.parse(fs.readFileSync(DUMP, 'utf-8'));
console.log(`Moléculas cargadas: ${moleculas.length}`);

const duplicados = detectarDuplicados(moleculas);

// Resumen por motivo
const porMotivo = new Map();
for (const d of duplicados) porMotivo.set(d.motivo, (porMotivo.get(d.motivo) || 0) + 1);
console.log('\nParejas candidatas a duplicado por motivo:');
console.table(Object.fromEntries(porMotivo));

// CSV
const header = 'id_a,nombre_a,id_b,nombre_b,score,motivo,atc_a,atc_b,canon_a,canon_b';
const lines = [header];
for (const d of duplicados) {
  lines.push([
    d.idA, d.nombreA, d.idB, d.nombreB, d.score, d.motivo, d.atcA, d.atcB, d.canonA, d.canonB,
  ].map((v) => (v == null ? '' : String(v).includes(',') ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(','));
}
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8');
console.log(`\nReporte de duplicados -> ${OUT} (${duplicados.length} parejas)`);
console.log('\nREGLAS de fusión para el dueño (ver AGENTS):');
console.log('  - Sal (besilato/mesilato/etc.) + mismo ATC  -> fusionar');
console.log('  - Penicilina V vs G (ATC distinto)          -> NO fusionar');
console.log('  - Iodo/Yodo                                 -> fusionar');
console.log('  - Vitamina A vs C vs D (grupos distintos)   -> NO fusionar');