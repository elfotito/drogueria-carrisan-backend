// scripts/enlazar-moleculas.mjs
// Task C: re-evaluar moleculas INHRR pendientes (no_match + revisar) contra
// moleculas_referencias (nombre + sinonimos) y contra atc_clasificaciones nivel 5.
// Genera CSVs de propuestas para decision del dueno. NO toca la BD.
//
// Salidas (data/):
//   enlazar_moleculas_propuestas_<fecha>.csv   -> cada pendiente con mejores candidatos (refs + ATC)
//   enlazar_moleculas_resumen_<fecha>.txt      -> conteos y top candidatos
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PIPELINE } from './moleculaDuplicados.mjs';

const { tokensSignificativos, scoreMoleculas } = PIPELINE;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const FECHA = new Date().toISOString().slice(0, 10);
const OUT_CSV = path.join(DATA, `enlazar_moleculas_propuestas_${FECHA}.csv`);
const OUT_TXT = path.join(DATA, `enlazar_moleculas_resumen_${FECHA}.txt`);
const UMBRAL_AUTO_REFS = 0.9;
const UMBRAL_ATC = 0.85;

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

const dump = JSON.parse(fs.readFileSync(path.join(DATA, 'moleculas_referencias_dump.json'), 'utf-8'));
const atcCSV = fs.readFileSync(path.join(DATA, 'atc_clasificaciones_import.csv'), 'utf-8');
const nivel5 = atcCSV.trim().split('\n').slice(1).map((l) => {
  const i = l.indexOf(','); const resto = l.slice(i + 1); const j = resto.indexOf(',');
  return { codigo: l.slice(0, i), nombre: resto.slice(0, j), nivel: Number(resto.slice(j + 1).split(',')[0]) };
}).filter((a) => a.nivel === 5);

const noMatch = leerCSV('catalogo_moleculas_no_match.csv').map((r) => r.mol_inhrr.toUpperCase());
const revisar = leerCSV('catalogo_moleculas_revisar.csv').map((r) => r.mol_inhrr.toUpperCase());
const pendientes = [...new Set([...noMatch, ...revisar])];

const refs = dump.map((m) => ({ nombre: m.nombre, sinonimos: m.sinonimos || [] }));

// indice de tokens -> indices de refs (nombre + sinonimos)
const idxRefs = new Map();
refs.forEach((r, i) => {
  for (const cand of [r.nombre, ...r.sinonimos]) for (const t of tokensSignificativos(cand)) {
    if (!idxRefs.has(t)) idxRefs.set(t, []);
    idxRefs.get(t).push(i);
  }
});
const idxAtc = new Map();
nivel5.forEach((a, i) => {
  for (const t of tokensSignificativos(a.nombre)) {
    if (!idxAtc.has(t)) idxAtc.set(t, []);
    idxAtc.get(t).push(i);
  }
});

function mejorContra(nombre, idx, lista) {
  const toks = tokensSignificativos(nombre);
  const candSet = new Set();
  for (const t of toks) for (const i of (idx.get(t) || [])) candSet.add(i);
  let best = { score: 0, cand: '' };
  for (const i of candSet) {
    const cand = lista[i];
    const sc = scoreMoleculas(nombre, cand);
    if (sc > best.score) best = { score: sc, cand };
  }
  return best;
}

const filas = [];
for (const p of pendientes) {
  const origen = noMatch.includes(p) ? 'no_match' : 'revisar';
  const bRefs = mejorContra(p, idxRefs, refs.map((r) => [r.nombre, ...r.sinonimos].join(' ³ ')));
  const bAtc = mejorContra(p, idxAtc, nivel5.map((a) => a.nombre));
  const estado = bRefs.score >= UMBRAL_AUTO_REFS ? 'auto_refs'
    : bRefs.score >= 0.75 ? 'banda_refs'
    : bAtc.score >= UMBRAL_ATC ? 'propuesta_atc' : 'sin_candidato';
  filas.push({
    mol_inhrr: p, origen, estado,
    score_refs: (+bRefs.score).toFixed(3), candidato_refs: bRefs.cand,
    score_atc: (+bAtc.score).toFixed(3), codigo_atc: bAtc.cand.split(' ')[0] || '', candidato_atc: bAtc.cand.split(' ').slice(1).join(' ') || bAtc.cand,
  });
}

function csvEscape(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
const header = ['mol_inhrr', 'origen', 'estado', 'score_refs', 'candidato_refs', 'score_atc', 'codigo_atc', 'candidato_atc'];
const csvLines = [header.join(',')];
for (const f of filas.sort((a, b) => b.estado.localeCompare(a.estado) || Number(b.score_refs) - Number(a.score_refs))) {
  csvLines.push(header.map((h) => csvEscape(f[h])).join(','));
}
fs.writeFileSync(OUT_CSV, csvLines.join('\n'), 'utf-8');

const conteos = {};
for (const f of filas) conteos[f.estado] = (conteos[f.estado] || 0) + 1;
const txt = [
  `pendientes evaluadas: ${pendientes.length} (no_match ${noMatch.length} + revisar ${revisar.length})`,
  ...Object.entries(conteos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`),
];
for (const [k, v] of Object.entries(conteos)) {
  if (k !== 'sin_candidato') {
    txt.push('');
    txt.push(`== ${k} (${v}) ==`);
    for (const f of filas.filter((x) => x.estado === k)) {
      const cand = k === 'propuesta_atc' ? `${f.candidato_atc} [${f.codigo_atc}]` : f.candidato_refs;
      txt.push(`${f.mol_inhrr}  ->  ${cand} (refs ${f.score_refs} | atc ${f.score_atc})`);
    }
  }
}
fs.writeFileSync(OUT_TXT, txt.join('\n'), 'utf-8');

console.log(txt.join('\n'));
console.log(`\nCSV: ${OUT_CSV}`);
console.log(`TXT: ${OUT_TXT}`);