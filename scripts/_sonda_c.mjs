// scripts/_sonda_c.mjs
// Sonda Task C: cruzar las mol_inhrr pendientes (no_match+revisar) contra
// moleculas_referencias (nombre+sinonimos) y contra atc nivel 5 (nuevo).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PIPELINE } from './moleculaDuplicados.mjs';

const { normName, tokensSignificativos, scoreMoleculas, levenshtein } = PIPELINE;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'moleculas_referencias_dump.json'), 'utf-8'));
const atcCSV = fs.readFileSync(path.join(ROOT, 'data', 'atc_clasificaciones_import.csv'), 'utf-8');
const atc = atcCSV.trim().split('\n').slice(1).map((l) => {
  const i = l.indexOf(',');
  const resto = l.slice(i + 1);
  const j = resto.indexOf(',');
  return { codigo: l.slice(0, i), nombre: resto.slice(0, j), nivel: Number(resto.slice(j + 1).split(',')[0]) };
});
const nivel5 = atc.filter((a) => a.nivel === 5);

function leerCSV(p) {
  const lines = fs.readFileSync(path.join(ROOT, p), 'utf-8').trim().split('\n');
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => {
    // parse simple con comillas
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

const noMatch = leerCSV('data/catalogo_moleculas_no_match.csv').map((r) => r.mol_inhrr.toUpperCase());
const revisar = leerCSV('data/catalogo_moleculas_revisar.csv').map((r) => r.mol_inhrr.toUpperCase());
const pendientes = [...new Set([...noMatch, ...revisar])];
console.log('pendientes:', pendientes.length, '(no_match', noMatch.length, '+ revisar', revisar.length, ')');

// moléculas referencias: nombre + sinonimos como candidatos
const refs = dump.map((m) => ({ nombre: m.nombre, sinonimos: m.sinonimos || [] }));

function scoreContraCandidatos(nombre, candidatos) {
  let best = { score: 0, candidato: '' };
  for (const c of candidatos) {
    // match contra nombre y cada sinonimo
    for (const cand of [c.nombre, ...c.sinonimos]) {
      const toks = tokensSignificativos(nombre);
      const toksC = tokensSignificativos(cand);
      if (!toks.some((t) => toksC.some((tc) => tc === t))) continue;
      const sc = scoreMoleculas(nombre, cand);
      if (sc > best.score) best = { score: sc, candidato: cand };
    }
  }
  return best;
}

const idx = new Map(); // token -> indices de refs
refs.forEach((r, i) => {
  for (const cand of [r.nombre, ...r.sinonimos]) {
    for (const t of tokensSignificativos(cand)) {
      if (!idx.has(t)) idx.set(t, []);
      idx.get(t).push(i);
    }
  }
});

let res = 0, revisa = 0, sinMol = 0;
const conAplicRes = [];
const listaSin = [];
for (const p of pendientes) {
  // candidatos por token compartido
  const toks = tokensSignificativos(p);
  const candSet = new Set();
  for (const t of toks) for (const i of (idx.get(t) || [])) candSet.add(i);
  const candidatos = [...candSet].map((i) => refs[i]);
  const b = scoreContraCandidatos(p, candidatos);
  if (b.score >= 0.9) { res++; conAplicRes.push({ mol: p, candidato: b.candidato, score: b.score }); }
  else if (b.score >= 0.75) { revisa++; listaSin.push({ mol: p, score: b.score, candidato: b.candidato, tipo: 'banda' }); }
  else sinMol++;
}

console.log(`vs moleculas_referencias: resueltas(>=0.9)=${res} | banda(0.75-0.9)=${revisa} | sin candidato=${sinMol}`);
console.log('\n--- resueltas nuevamente (vs refs) ---');
for (const r of conAplicRes) console.log(`${r.mol}  ->  ${r.candidato} (${(+r.score).toFixed(3)})`);
console.log('\n--- banda ---');
for (const r of listaSin) console.log(`${r.mol}  ->  ${r.candidato} (${(+r.score).toFixed(3)})`);

// ===== Candidatos ATC nivel 5 para los sin candidato (propuesta de insercion) =====
const idxAtc = new Map();
nivel5.forEach((a, i) => {
  for (const t of tokensSignificativos(a.nombre)) {
    if (!idxAtc.has(t)) idxAtc.set(t, []);
    idxAtc.get(t).push(i);
  }
});
function scoreContraAtc(nombre) {
  const toks = tokensSignificativos(nombre);
  const candSet = new Set();
  for (const t of toks) for (const i of (idxAtc.get(t) || [])) candSet.add(i);
  let best = { score: 0, codigo: '', nombre: '' };
  for (const i of candSet) {
    const a = nivel5[i];
    const sc = scoreMoleculas(nombre, a.nombre);
    if (sc > best.score) best = { score: sc, codigo: a.codigo, nombre: a.nombre };
  }
  return best;
}
const sinCandidato = pendientes.filter((p) => {
  const toks = tokensSignificativos(p);
  const candSet = new Set();
  for (const t of toks) for (const i of (idx.get(t) || [])) candSet.add(i);
  const candidatos = [...candSet].map((i) => refs[i]);
  return scoreContraCandidatos(p, candidatos).score < 0.75;
});
console.log(`\n--- sin candidato en refs: ${sinCandidato.length} ---`);
const propuestos = [];
for (const p of sinCandidato) {
  const b = scoreContraAtc(p);
  if (b.score >= 0.85) propuestos.push({ mol: p, codigo: b.codigo, atc: b.nombre, score: b.score });
}
console.log(`con candidato ATC nivel5 (>=0.85): ${propuestos.length}`);
for (const r of propuestos.sort((a, b) => b.score - a.score)) console.log(`${r.mol}  ->  ${r.codigo} ${r.atc} (${(+r.score).toFixed(3)})`);