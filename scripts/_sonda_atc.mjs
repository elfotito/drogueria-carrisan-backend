// scripts/_sonda_atc.mjs
// Sonda pura Task B: ¿cuántas de las 1,471 moléculas sin atc_id tienen candidato
// claro en atc_clasificaciones (nivel 5) por nombre normalizado?
// Solo lee: dump de moleculas + CSV de ATC. NO toca la BD.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PIPELINE } from './moleculaDuplicados.mjs';

const { normName, canonico, scoreMoleculas, tokensSignificativos, levenshtein } = PIPELINE;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'moleculas_referencias_dump.json'), 'utf-8'));
const atcCSV = fs.readFileSync(path.join(ROOT, 'data', 'atc_clasificaciones_import.csv'), 'utf-8');

const atc = atcCSV.trim().split('\n').slice(1)
  .map((l) => {
    const i = l.indexOf(',');
    const codigo = l.slice(0, i);
    const resto = l.slice(i + 1);
    const j = resto.indexOf(',');
    const nombre = resto.slice(0, j);
    // es_sistema = resto tras segundo campo
    return { codigo, nombre, nivel: Number(resto.slice(j + 1).split(',')[0]) };
  });

const nivel5 = atc.filter((a) => a.nivel === 5);
const nivel4 = atc.filter((a) => a.nivel === 4);

const sinAtc = dump.filter((m) => !m.atc_id);
console.log('moléculas totales:', dump.length, '| sin atc_id:', sinAtc.length);
console.log('atc nivel 5:', nivel5.length, '| nivel 4:', nivel4.length);

// Índice por canónico para match exacto de nivel5
const idxN5 = new Map();
for (const a of nivel5) {
  const c = canonico(a.nombre);
  if (!c) continue;
  if (!idxN5.has(c)) idxN5.set(c, []);
  idxN5.get(c).push(a);
}

let exacto = 0, fuzzy = 0, porEn = 0, porSubstr = 0, sinMatch = 0;
const fuzzyCand = [];
const sinMatchList = [];
const porEnList = [];
const porSubstrList = [];

for (const m of sinAtc) {
  const c = canonico(m.nombre);
  const exact = c && idxN5.get(c);
  if (exact && exact.length) {
    exacto++;
    continue;
  }

  // Señal 1: nombre_generico_en contra ATC nivel 5
  let best = { score: 0, cand: null };
  const en = String(m.nombre_generico_en ?? '').trim().toLowerCase();
  if (en) {
    for (const cand of nivel5) {
      const sc = scoreMoleculas(en, cand.nombre);
      if (sc > best.score) best = { score: sc, cand, via: 'en' };
    }
  }

  // Señal 2: substring exacto (nombres compuestos / traducciones)
  if (best.score < 0.9) {
    const nNorm = normName(m.nombre);
    for (const cand of nivel5) {
      const cNorm = normName(cand.nombre);
      if (cNorm && (cNorm.includes(nNorm) || (nNorm.length > 3 && nNorm.includes(cNorm)))) {
        const subMejor = Math.min(cNorm.length, nNorm.length) / Math.max(cNorm.length, nNorm.length);
        if (subMejor > best.score) best = { score: subMejor, cand, via: 'substr' };
      }
    }
  }

  // Señal 3: fuzzy por nombre (solo si aún no hay candidato bueno)
  if (best.score < 0.9) {
    for (const cand of nivel5) {
      const toks = tokensSignificativos(m.nombre);
      const toksC = tokensSignificativos(cand.nombre);
      if (!toks.some((t) => toksC.some((tc) => tc === t))) continue;
      const sc = scoreMoleculas(m.nombre, cand.nombre);
      if (sc > best.score) best = { score: sc, cand, via: 'nombre' };
    }
    // sinónimos
    for (const s of (m.sinonimos || [])) {
      for (const cand of nivel5) {
        const toks = tokensSignificativos(s);
        const toksC = tokensSignificativos(cand.nombre);
        if (!toks.some((t) => toksC.some((tc) => tc === t))) continue;
        const sc = scoreMoleculas(s, cand.nombre);
        if (sc > best.score) best = { score: sc, cand, via: 'sinonimo' };
      }
    }
  }

  if (best.score >= 0.9 && best.cand) {
    const rec = { ...m, score: Math.round(best.score * 1000) / 1000, cand: best.cand.codigo, candNombre: best.cand.nombre, via: best.via };
    switch (best.via) {
      case 'en': porEn++; porEnList.push(rec); break;
      case 'substr': porSubstr++; porSubstrList.push(rec); break;
      case 'nombre': case 'sinonimo': fuzzy++; fuzzyCand.push(rec); break;
    }
  } else {
    sinMatch++;
    sinMatchList.push({ ...m, score: Math.round(best.score * 1000) / 1000, candCandidato: best.cand?.codigo || '', candNombre: best.cand?.nombre || '' });
  }
}

// Escore token a token SIN filtrar sales (para ATC es demasiado agresivo filtrarlas:
// "Sodio Hidroxido" quedaria "hidroxido" y matchearia "Ferrico Hidroxido").
function scoreSinSales(a, b) {
  const ta = normName(a).split(' ').filter(Boolean);
  const tb = normName(b).split(' ').filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  let suma = 0;
  for (const t of ta) {
    let best = 0;
    for (const r of tb) best = Math.max(best, 1 - levenshtein(t, r) / Math.max(t.length, r.length));
    suma += best;
  }
  return suma / Math.max(ta.length, tb.length);
}

// Recalculo con score sin filtrar sales y reporto unicidad
// Pre-filtro: índice token->candidatos (evita O(1471x5201) con levenshtein por par).
const idxTok = new Map();
for (const cand of nivel5) {
  for (const t of normName(cand.nombre).split(' ').filter(Boolean)) {
    if (!idxTok.has(t)) idxTok.set(t, []);
    idxTok.get(t).push(cand);
  }
}
let sabesCuenta = 0, ambiguos = 0, sinCand2 = 0;
const seguros = []; // mejor candidato único con score >= 0.90
const ambiguousList = [];
for (const m of sinAtc) {
  const toks = normName(m.nombre).split(' ').filter(Boolean);
  const vistos = new Set();
  let cands = [];
  for (const t of toks) {
    for (const cand of (idxTok.get(t) || [])) {
      if (vistos.has(cand.codigo)) continue;
      vistos.add(cand.codigo);
      const sc = scoreSinSales(m.nombre, cand.nombre);
      if (sc >= 0.9) cands.push({ cand, sc });
    }
  }
  cands.sort((a, b) => b.sc - a.sc);
  if (cands.length === 1) { sabesCuenta++; seguros.push({ m, c: cands[0] }); }
  else if (cands.length > 1) { ambiguos++; ambiguousList.push({ m, cands }); }
  else sinCand2++;
}
console.log(`\nscore-sin-sales >=0.90 y ÚNICO: ${sabesCuenta} | ambiguo (>1): ${ambiguos} | sin>=0.9: ${sinCand2}`);
console.log('\n--- seguros únicos (todos) ---');
for (const { m, c } of seguros) console.log(`${m.id} | ${m.nombre}  →  ${c.cand.nombre} (${c.cand.codigo}) score ${Math.round(c.sc * 1000) / 1000}`);
console.log(`\n--- ambiguos (muestra) ---`);
for (const { m, cands } of ambiguousList.slice(0, 30)) console.log(`${m.id} | ${m.nombre}  →  ${cands.map((x) => `${x.cand.nombre}(${x.cand.codigo}) ${Math.round(x.sc * 1000) / 1000}`).join(' | ')}`);