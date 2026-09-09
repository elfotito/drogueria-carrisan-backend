import fs from 'fs';

const lines = fs.readFileSync('data/moleculas_duplicados_2026-09-09.csv', 'utf-8').trim().split('\n');
function parseCSVLine(l) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const rows = lines.slice(1).map(parseCSVLine);

const grupos = new Map();
for (const r of rows) {
  if (r[5] === 'canonico_igual') {
    const k = r[8];
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push([r[1], r[3]]);
  }
}
console.log('grupos canonico_igual:', grupos.size);
let n = 0;
for (const [k, v] of grupos) {
  if (v.length > 1) {
    console.log('GRUPO', JSON.stringify(k), '->', v.length, 'moléculas');
    for (const [a, b] of v.slice(0, 8)) console.log('     ', a, '|', b);
    n++;
    if (n >= 12) break;
  }
}
console.log('muestra de grupos con >1 par:', n);

// nombre_similar completo
const rr = rows.filter((r) => r[5] === 'nombre_similar');
console.log('\n--- nombre_similar (' + rr.length + ') ---');
for (const r of rr) console.log(r[1], '|', r[3], '| score', r[4]);