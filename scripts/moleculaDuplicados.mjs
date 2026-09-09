// scripts/moleculaDuplicados.mjs
// Detección pura de duplicados en moleculas_referencias.
// Reutiliza el pipeline del importar-catalogo.mjs: stopwords + sales + tokens
// normalizados (sin acentos). NO toca la BD — produce candidatos para que el
// dueño valide antes de fusionar (regla: sin CSV aprobado no hay fusión).
//
// Señales de duplicado (motivo):
//   canonico_igual    -> mismos tokens significativos (tras quitar stopwords/sales)
//   mismo_generico_en -> mismo nombre_generico_en y score >= 0.75
//   nombre_similar    -> canónicos muy similares (score >= 0.9) vía índice bigramas
// OJO: un ATC compartido NO es señal de duplicado (Fentanilo/Sufentanilo,
// Aciclovir/Valaciclovir comparten grupo ATC pero son fármacos distintos).
// Las sales se capturan con canonico_igual (mismos tokens tras quitar sales).

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'a', 'o', 'e', 'en', 'para', 'por', 'con', 'un', 'una', 'al', 'di',
]);

const SALES = new Set([
  'clorhidrato', 'diclorhidrato', 'hidrocloruro', 'bromhidrato', 'hidrobromuro', 'monohidrato', 'dihidrato',
  'trihidrato', 'hemihidrato', 'monohidratado', 'hidratado', 'hidratada', 'sulfato', 'bisulfato', 'besilato',
  'mesilato', 'citrato',
  'fumarato', 'maleato', 'tartrato', 'succinato', 'acetato', 'sodico', 'sodica', 'sodio', 'disodico', 'disodio',
  'potasico', 'potasica', 'potasio', 'calcico', 'calcica', 'calcio', 'fosfato', 'pamoato', 'nitrato', 'edetato',
  'estearato', 'carbonato', 'bicarbonato', 'gluconato', 'lactato', 'silicio', 'anhidro', 'anhidra', 'monobasico',
  'dibasico', 'micronizado', 'micronizada', 'acido', 'acida', 'ferroso', 'ferrosa', 'ferrico', 'ferrica',
  'bromuro', 'cloruro', 'yoduro', 'fluoruro',
]);

export function normName(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokens significativos: quitamos stopwords y sales (el pipeline INHRR).
export function tokensSignificativos(nombre) {
  const n = normName(nombre);
  if (!n) return [];
  return n.split(' ').filter((t) => t && !STOPWORDS.has(t) && !SALES.has(t));
}

export function canonico(nombre) {
  return tokensSignificativos(nombre).sort().join(' ');
}

// Distancia de Levenshtein (para números pequeños es suficiente).
export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

function sim(tokenA, tokenB) {
  const a = normName(tokenA);
  const b = normName(tokenB);
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Score token a token igual que importar-catalogo.mjs:
//   sum(best sim de cada token significativo) / max(#toks a, #toks b)
export function scoreMoleculas(nombreA, nombreB) {
  const tA = tokensSignificativos(nombreA);
  const tB = tokensSignificativos(nombreB);
  if (tA.length === 0 || tB.length === 0) return 0;
  let suma = 0;
  for (const tok of tA) {
    let best = 0;
    for (const ref of tB) best = Math.max(best, sim(tok, ref));
    suma += best;
  }
  return suma / Math.max(tA.length, tB.length);
}

// Bigramas de un canónico (para indexar búsquedas de similitud).
export function bigramas(canon) {
  const t = canon.replace(/\s+/g, '');
  if (t.length <= 1) return t ? [t] : [];
  const out = new Set();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return [...out];
}

/**
 * Detecta candidatos a duplicado.
 * @param {Array<{id, nombre, nombre_generico_en, atc_codigo}>} moleculas
 * @param {object} opts { umbralSimilar: 0.9, umbralAtc: 0.75 }
 * @returns {Array<{idA, nombreA, idB, nombreB, score, motivo, atcA, atcB, canonA, canonB}>}
 */
export function detectarDuplicados(moleculas, opts = {}) {
  const { umbralSimilar = 0.9, umbralAtc = 0.75 } = opts;
  const porId = new Map(moleculas.map((m) => [String(m.id), m]));
  const parejas = new Map(); // key "idA|idB" -> candidato (evita duplicar pareja)

  const addPareja = (a, b, score, motivo) => {
    const [idA, idB] = [String(a.id), String(b.id)].sort((x, y) => Number(x) - Number(y));
    const key = `${idA}|${idB}`;
    if (parejas.has(key)) return;
    parejas.set(key, {
      idA, nombreA: porId.get(idA).nombre, idB, nombreB: porId.get(idB).nombre,
      score: Math.round(score * 1000) / 1000,
      motivo,
      atcA: porId.get(idA).atc_codigo ?? '', atcB: porId.get(idB).atc_codigo ?? '',
      canonA: canonico(porId.get(idA).nombre), canonB: canonico(porId.get(idB).nombre),
    });
  };

  // 1) Canónico idéntico (sin stopwords/sales) -> duplicado seguro.
  const bucketsCanon = new Map();
  for (const m of moleculas) {
    const c = canonico(m.nombre);
    if (!c) continue;
    if (!bucketsCanon.has(c)) bucketsCanon.set(c, []);
    bucketsCanon.get(c).push(m);
  }
  for (const list of bucketsCanon.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        addPareja(list[i], list[j], 1, 'canonico_igual');
      }
    }
  }

  // 2) Mismo nombre_generico_en -> señal fuerte de variante/sal.
  const bucketsEn = new Map();
  for (const m of moleculas) {
    const en = String(m.nombre_generico_en ?? '').trim().toLowerCase();
    if (!en) continue;
    if (!bucketsEn.has(en)) bucketsEn.set(en, []);
    bucketsEn.get(en).push(m);
  }
  for (const list of bucketsEn.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const sc = scoreMoleculas(list[i].nombre, list[j].nombre);
        if (sc >= umbralAtc) addPareja(list[i], list[j], sc, 'mismo_generico_en');
      }
    }
  }

  // 3) (eliminado) mismo ATC NO es señal: Fentanilo/Sufentanilo comparten grupo
  //    ATC pero son fármacos distintos. Las sales ya caen en canonico_igual.

  // 4) Nombre muy similar (sin ATC ni EN compartido): índice de bigramas.
  //    Umbral alto (0.9) para evitar falsos positivos (Avatrombopag≠Eltrombopag,
  //    Clonazepam≠Lorazepam). Las variantes de género tipo Amlodipino/Amlodipina
  //    puntúan 0.9; Iodo/Yodo y las sales ya caen en la señal EN/ATC.
  const idx = new Map(); // bigrama -> [moleculas]
  for (const m of moleculas) {
    const c = canonico(m.nombre);
    if (!c) continue;
    for (const bg of bigramas(c)) {
      if (!idx.has(bg)) idx.set(bg, []);
      idx.get(bg).push(m);
    }
  }
  const vistos4 = new Set();
  for (const list of idx.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const k = [String(a.id), String(b.id)].sort().join('|');
        if (vistos4.has(k)) continue;
        vistos4.add(k);
        const sc = scoreMoleculas(a.nombre, b.nombre);
        if (sc >= umbralSimilar) addPareja(a, b, sc, 'nombre_similar');
      }
    }
  }

  return [...parejas.values()];
}

// Exportado para reusar en scripts futuros.
export const PIPELINE = { normName, tokensSignificativos, canonico, scoreMoleculas, bigramas, levenshtein, STOPWORDS, SALES };