import fs from 'fs';

function leerCsv(p) {
  const text = fs.readFileSync(p, 'utf8').trim();
  const lines = text.split(/\r?\n/).slice(1);
  const out = [];
  for (const l of lines) {
    const cols = l.split(',').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
    out.push({ id: cols[0], sku: cols[1] || '', nombre: cols[2] || '', mol: cols[3] || '', forma: cols[4] || '' });
  }
  return out;
}

const antiguo = new Map(leerCsv('data/productos_sin_foto_antiguo.csv').map(r => [r.id, r]));
const nuevo = new Map(leerCsv('data/productos_sin_foto.csv').map(r => [r.id, r]));

const perdian = [...nuevo.entries()].filter(([id]) => !antiguo.has(id)).map(([id, r]) => ({ id, ...r }));
const ganaron = [...antiguo.entries()].filter(([id]) => !nuevo.has(id)).map(([id, r]) => ({ id, ...r }));

console.log('PERDIERON FOTO (eran con foto):', perdian.length);
// separar combinación (dos dosis o dos moléculas) vs mono
const esCombo = r => /-\s*\d|-\s*\d+mg|HCT|\bPE\b| - |\+\s*$/.test(r.nombre) || (r.mol && r.mol.includes(' - '));
const combosPerdidos = perdian.filter(esCombo);
const monosPerdidos = perdian.filter(r => !esCombo(r));
console.log('  combinación:', combosPerdidos.length, ' | mono:', monosPerdidos.length);
console.log('\n--- PERDIDOS COMBO (muestra 60) ---');
for (const r of combosPerdidos.slice(0, 60)) {
  console.log(`${r.id} | ${r.nombre} | mol=${r.mol}`);
}
console.log('\n--- PERDIDOS MONO (id | nombre) ---');
for (const r of monosPerdidos) {
  console.log(`${r.id} | ${r.nombre}`);
}
console.log('\nGANARON FOTO (eran sin foto):', ganaron.length);