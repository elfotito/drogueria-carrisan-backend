// scripts/insertar-moleculas-nuevas.mjs
// Task C: genera SQL para insertar en moleculas_referencias las moleculas INHRR
// sin candidato CIMA pero con ATC nivel 5 inequivoco (propuestas aprobadas por el dueno).
// Agrupa por codigo_atc (una molecula canonica por ATC) y usa los mol_inhrr como sinonimos.
// Tambien genera data/moleculas_overrides_<fecha>.csv (append a moleculas_overrides.csv).
// NO toca la BD: genera archivos.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const FECHA = new Date().toISOString().slice(0, 10);
const PROPUESTAS = 'enlazar_moleculas_propuestas_2026-09-10.csv';
const OUT_SQL = path.join(DATA, `moleculas_nuevas_insert_${FECHA}.sql`);
const OUT_OVR = path.join(DATA, `moleculas_overrides_${FECHA}.csv`);

const EXCLUIDA = 'AGUA DESTILADA';

function leerCSV(p) {
  const lines = fs.readFileSync(path.join(DATA, p), 'utf-8').trim().split('\n');
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    const o = {};
    head.forEach((h, i) => (o[h.trim()] = (out[i] ?? '').trim()));
    return o;
  });
}

const prop = leerCSV(PROPUESTAS).filter(
  (r) => r.estado === 'propuesta_atc' && r.mol_inhrr !== EXCLUIDA && r.codigo_atc
);
console.log('aprobadas con ATC:', prop.length);

// grupo por codigo_atc -> { codigo, nombreAtc, molInhrr[] }
const grupos = new Map();
for (const r of prop) {
  if (!grupos.has(r.codigo_atc)) grupos.set(r.codigo_atc, { codigo: r.codigo_atc, nombreAtc: r.candidato_atc, molInhrr: [] });
  grupos.get(r.codigo_atc).molInhrr.push(r.mol_inhrr);
}
const canonicas = [...grupos.values()];
console.log('moleculas canonicas (por ATC):', canonicas.length);

function sqlescape(v) { return `'${String(v).replace(/'/g, "''")}'`; }
function arrEscape(arr) {
  const elems = arr.map((e) => `'${String(e).replace(/'/g, "''")}'`).join(',');
  return `ARRAY[${elems}]::text[]`;
}

const stmts = [];
for (const g of canonicas) {
  const sinonimos = g.molInhrr.map((m) => m.charAt(0) + m.slice(1).toLowerCase()); // capitalizado
  stmts.push(`INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT ${sqlescape(g.nombreAtc)}, NULL, ${arrEscape(sinonimos)}, a.id
FROM atc_clasificaciones a
WHERE a.codigo = ${sqlescape(g.codigo)}
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = ${sqlescape(g.nombreAtc)});`);
}

fs.writeFileSync(OUT_SQL, stmts.join('\n\n') + '\n', 'utf-8');

// overrides: cada mol_inhrr -> nombre canonico
const ovrLines = ['mol_inhrr,mol_cima'];
for (const g of canonicas) for (const m of [...new Set(g.molInhrr)]) ovrLines.push(`${m},${g.nombreAtc}`);
fs.writeFileSync(OUT_OVR, ovrLines.join('\n') + '\n', 'utf-8');

console.log(`SQL:  ${OUT_SQL} (${stmts.length} statements)`);
console.log(`OVR:  ${OUT_OVR} (${ovrLines.length - 1} overrides)`);
for (const g of canonicas) console.log(`${g.codigo} ${g.nombreAtc}  <- ${g.molInhrr.join(' | ')}`);