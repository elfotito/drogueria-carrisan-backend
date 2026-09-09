// scripts/completarAtc.mjs
// Task B pura: cruzar moléculas sin atc_id contra atc_clasificaciones (nivel 5)
// para proponer/verificar el ATC faltante. NO toca BD — produce candidatos y un
// reporte CSV de decisión para el dueño (regla: solo insertar lo verificable).
//
// Estrategia:
//   - Score token a token SIN filtrar sales (filtrarlas es agresivo para ATC:
//     "Sodio Hidroxido" quedaría "hidroxido" y matchearía "Ferrico Hidroxido").
//   - Autogenerado ("auto") SOLO si el mejor candidato >= 0.90 y es ÚNICO.
//   - "revisar" si hay varios candidatos ambiguos (>= 0.90 a 2+ ATC) o el mejor
//     cae en la banda 0.75-0.90.
//   - "sin_candidato" si el mejor < 0.75.
// Las señales extra (nombre_generico_en, sinonimos) se reportan como contexto
// en el CSV para que el dueño decida, pero NO bastan para auto-categorizar.

export function scoreSinSales(normTokenFn, levenshteinFn, a, b) {
  const ta = normTokenFn(a).split(' ').filter(Boolean);
  const tb = normTokenFn(b).split(' ').filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  let suma = 0;
  for (const t of ta) {
    let best = 0;
    for (const r of tb) best = Math.max(best, 1 - levenshteinFn(t, r) / Math.max(t.length, r.length));
    suma += best;
  }
  return suma / Math.max(ta.length, tb.length);
}

/**
 * Clasifica una molécula contra la lista de ATC nivel 5.
 * @param {{nombre, nombre_generico_en, sinonimos}} m
 * @param {Array<{codigo, nombre}>} nivel5
 * @param {{normTokenFn, levenshteinFn}} deps
 * @param {object} opts { autoUmbral: 0.9, revisarUmbral: 0.75, topN: 3 }
 * @returns {{estado, candidato, candidatos}}
 */
export function clasificar(m, nivel5, deps, opts = {}) {
  const { autoUmbral = 0.9, revisarUmbral = 0.75, topN = 3 } = opts;
  const { normTokenFn, levenshteinFn } = deps;
  const sc = (a, b) => scoreSinSales(normTokenFn, levenshteinFn, a, b);

  const cands = [];
  for (const cand of nivel5) {
    const s = sc(m.nombre, cand.nombre);
    if (s >= revisarUmbral) cands.push({ codigo: cand.codigo, nombre: cand.nombre, score: Math.round(s * 1000) / 1000 });
  }
  cands.sort((a, b) => b.score - a.score);

  const top = cands.filter((c) => c.score >= autoUmbral);
  if (cands.length === 0) return { estado: 'sin_candidato', candidato: null, candidatos: [] };
  if (top.length === 1) return { estado: 'auto', candidato: cands[0], candidatos: cands.slice(0, topN) };
  if (cands[0].score >= autoUmbral || cands[0].score >= revisarUmbral) {
    return { estado: 'revisar', candidato: cands[0], candidatos: cands.slice(0, topN) };
  }
  return { estado: 'sin_candidato', candidato: cands[0], candidatos: cands.slice(0, topN) };
}

/**
 * Escapa un campo CSV correctamente (comillas, comas).
 * @export
 */
export function csvField(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Construye la fila CSV de una molécula clasificada.
 */
export function filaCsv(m, c) {
  return [
    csvField(m.id),
    csvField(m.nombre),
    csvField(m.nombre_generico_en ?? ''),
    csvField((m.sinonimos || []).join(' | ')),
    c.estado,
    csvField(c.candidato?.codigo ?? ''),
    csvField(c.candidato?.nombre ?? ''),
    c.candidato?.score ?? '',
    csvField(JSON.stringify(c.candidatos)),
  ].join(',');
}

export const CSV_HEADER = 'id,nombre,nombre_generico_en,sinonimos,estado,candidato_codigo,candidato_nombre,score,candidatos';