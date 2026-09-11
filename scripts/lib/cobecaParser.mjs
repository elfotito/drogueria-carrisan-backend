// scripts/lib/cobecaParser.mjs
// Parser farmacéutico: expande abreviaturas de la descripción COBECA y hace
// matching difuso contra los productos de la BD (molécula + forma + concentración + laboratorio).
// Funciones puras, sin side effects, sin imports de BD.

export const FORMAS_ABREV = {
  tab: 'tabletas',
  tabs: 'tabletas',
  comp: 'comprimidos',
  com: 'comprimidos',
  cap: 'capsulas',
  caps: 'capsulas',
  jbe: 'jarabe',
  jar: 'jarabe',
  jarabe: 'jarabe',
  pvo: 'polvo',
  polvo: 'polvo',
  susp: 'suspension',
  sus: 'suspension',
  gts: 'gotas',
  gotas: 'gotas',
  amp: 'solucion inyectable',
  ampul: 'solucion inyectable',
  iny: 'inyectable',
  inyec: 'inyectable',
  sol: 'solucion',
  solu: 'solucion',
  crem: 'crema',
  crema: 'crema',
  gel: 'gel',
  loc: 'locion',
  tinte: 'tintura',
  tint: 'tintura',
  sob: 'sobre',
  sobre: 'sobre',
  disp: 'dispersable',
  rec: 'recubierta',
  recub: 'recubierta',
  bld: 'blanda',
  mast: 'masticable',
  of: 'oftalmica',
  oft: 'oftalmica',
  ofl: 'oftalmica',
  spr: 'spray',
  aer: 'aerosol',
  aeros: 'aerosol',
  champu: 'champu',
  champ: 'champu',
  jab: 'jabon',
  jabon: 'jabon',
  lio: 'liofilizado',
  liof: 'liofilizado',
  ll: 'liofilizado',
  pll: 'prellenada',
  prel: 'prellenada',
  ovu: 'ovulos',
  ovul: 'ovulos',
  par: 'parche',
  parch: 'parche',
  mata: 'matafrasco',
  oral: 'oral',
  dent: 'dental',
  barra: 'barra',
  ung: 'unguento',
  pom: 'pomada',
  emul: 'emulsion',
  suspencion: 'suspension',
  tablet: 'tabletas',
  tabl: 'tabletas',
  grag: 'grajeas',
  sup0: 'supositorios',
  sup: 'supositorios',
  granu: 'granulados',
  grano: 'granulados',
};

// Tokens de ruido (abreviaturas de marca, sufijos, presentación) que no son
// parte de la molécula ni del laboratorio.
export const STOPWORDS = new Set([
  'x', 'con', 'de', 'del', 'la', 'para', 'uso', 't', 'c', 's', 'a', 'p', 'm',
  'cr', 'mt', 'rc', 'rt', 'cm', 'cap', 'capm', 'jebe', 'tabs', 'compr',
  'plus', 'f', 'g', 'n', 'z', 'k', 'bp', 'cv', 'v', 'abr',
  'ext', 'virg', 'extra', 'virgen', 'puro', 'pura', 'pura', 'natural',
  'sal', 'sabor', 'aroma', 'color', 'morado', 'gris', 'rojo', 'azul', 'verde',
  'clasico', 'original', 'normal', 'regular',
  'med', 'sup', 'derm', 'crop', 'corp', 'derma', 'nct', 'esp', 'fort',
]);

// Equivalencias de forma farmacéutica: mapea la forma normalizada de BD
// (que viene en mayúsculas) a una categoría canónica para comparar con COBECA.
export const FORMAS_EQUIV = {
  'tabletas': ['tabletas', 'comprimidos', 'tablets', 'grageas', 'tableta', 'comprimido'],
  'comprimidos': ['tabletas', 'comprimidos', 'tablets', 'grageas', 'tableta', 'comprimido'],
  'tablets': ['tabletas', 'comprimidos', 'tablets', 'grageas', 'tableta', 'comprimido'],
  'capsulas': ['capsulas', 'capsula', 'tabletas'],
  'jarabe': ['jarabe', 'suspension', 'suspension oral', 'suspension'],
  'suspension': ['suspension', 'suspension oral', 'jarabe'],
  'polvo': ['polvo', 'polvo para reconstitucion', 'polvo para suspension', 'polvo para reconstituir'],
  'suspension oral': ['suspension oral', 'suspension', 'jarabe'],
  'gotas': ['gotas', 'solucion oftalmica', 'solucion'],
  'crema': ['crema', 'unguento', 'pomada', 'locion'],
  'unguento': ['crema', 'unguento', 'pomada', 'locion'],
  'pomada': ['crema', 'unguento', 'pomada', 'locion'],
  'locion': ['locion', 'crema', 'unguento', 'pomada'],
  'gel': ['gel', 'solucion topica', 'crema'],
  'inyectable': ['inyectable', 'solucion inyectable', 'polvo para solucion inyectable', 'inhalacion', 'ampolla', 'jeringa prellenada'],
  'solucion inyectable': ['inyectable', 'solucion inyectable', 'polvo para solucion inyectable', 'ampolla', 'jeringa prellenada'],
  'inhalacion': ['inhalacion', 'solucion inyectable'],
  'ampolla': ['inyectable', 'solucion inyectable', 'ampolla'],
  'spray': ['spray', 'aerosol', 'solucion nasal', 'solucion'],
  'aerosol': ['spray', 'aerosol', 'solucion nasal', 'solucion'],
  'champu': ['champu', 'locion', 'jabon'],
  'jabon': ['jabon', 'champu'],
  'ovulos': ['ovulos', 'supositorios'],
  'supositorios': ['ovulos', 'supositorios'],
  'solucion': ['solucion', 'solucion oral', 'solucion topica', 'solucion nasal', 'solucion oftalmica', 'solucion ototopica', 'gotas'],
  'solucion oral': ['solucion oral', 'solucion', 'jarabe', 'suspension oral'],
  'solucion topica': ['solucion topica', 'solucion', 'crema', 'unguento', 'gel'],
  'solucion oftalmica': ['solucion oftalmica', 'solucion', 'gotas'],
  'solucion nasal': ['solucion nasal', 'solucion', 'spray', 'aerosol'],
  'solucion ototopica': ['solucion ototopica', 'solucion', 'gotas'],
  'polvo para reconstitucion': ['polvo para reconstitucion', 'polvo', 'polvo para suspension', 'polvo para suspension oral'],
  'jeringa prellenada': ['jeringa prellenada', 'inyectable', 'solucion inyectable'],
  'tintura': ['tintura', 'solucion', 'solucion topica'],
  'pastilla': ['pastilla', 'tabletas', 'comprimidos'],
  'granulados': ['granulados', 'sobre', 'polvo', 'polvo para reconstitucion', 'solucion oral'],
  'sobre': ['sobre', 'granulados', 'polvo', 'polvo para reconstitucion', 'polvo para suspension', 'polvo para suspension oral'],
  'parche': ['parche', 'crema', 'unguento'],
  'anillo vaginal': ['anillo vaginal', 'ovulos', 'supositorios'],
  'recubierta': ['tabletas', 'comprimidos', 'tableta', 'comprimido', 'recubierta', 'recubiertas'],
  'recubiertas': ['tabletas', 'comprimidos', 'tableta', 'comprimido', 'recubierta', 'recubiertas'],
  'blanda': ['capsulas', 'capsula', 'blanda', 'blandas'],
  'blandas': ['capsulas', 'capsula', 'blanda', 'blandas'],
  'dispersable': ['tabletas', 'comprimidos', 'dispersable'],
  'masticable': ['tabletas', 'comprimidos', 'masticable'],
  'oftalmica': ['solucion oftalmica', 'oftalmica', 'gotas'],
  'liofilizado': ['polvo para reconstitucion', 'polvo', 'liofilizado'],
  'prellenada': ['jeringa prellenada', 'inyectable', 'solucion inyectable'],
  'oral': ['solucion oral', 'solucion', 'jarabe', 'suspension oral'],
  'dental': ['solucion', 'gel', 'dental'],
  'emulsion': ['crema', 'locion', 'emulsion'],
};

export function formasSonEquivalentes(formaCobeca, formaDb) {
  const lista = FORMAS_EQUIV[formaCobeca];
  if (!lista) return false;
  return lista.some(f => formaDb.includes(f));
}


// Abreviaturas de moléculas más comunes
export const MOL_ABREV = {
  ac: 'acido',
  acido: 'acido',
  na: 'sodio',
  nacl: 'cloruro de sodio',
  kcl: 'cloruro de potasio',
  mg: 'magnesio',
  ca: 'calcio',
  aas: 'acido acetilsalicilico',
  atb: 'antibiotico',
  apap: 'acetaminofen',
  amox: 'amoxicilina',
  dxm: 'dexametasona',
  dex: 'dexametasona',
  pred: 'prednisolona',
  predn: 'prednisolona',
  vit: 'vitamina',
  vitc: 'acido ascorbico',
  vitb: 'vitamina b',
  tiamina: 'vitamina b1',
  riboflavina: 'vitamina b2',
  piridoxina: 'vitamina b6',
  cianocobalamina: 'vitamina b12',
  vitd: 'vitamina d',
  colecalciferol: 'vitamina d3',
  vtk: 'vitamina k',
  hierro: 'hierro',
  ferroso: 'hierro',
  vaca: 'vacuna',
  cla: 'clindamicina',
  clind: 'clindamicina',
  cipro: 'ciprofloxacina',
  azt: 'azitromicina',
  azi: 'azitromicina',
  claforan: 'cefotaxima',
  ceftriax: 'ceftriaxona',
  peni: 'penicilina',
  amp: 'ampicilina',
  gent: 'gentamicina',
  amika: 'amikacina',
  vanco: 'vancomicina',
  metro: 'metronidazol',
  mtro: 'metronidazol',
  ketorolac: 'ketorolaco',
  diclo: 'diclofenaco',
  anti: 'antihistaminico',
  parac: 'paracetamol',
  para: 'paracetamol',
  tylenol: 'paracetamol',
  ibu: 'ibuprofeno',
  asp: 'aspirina',
};

// Abreviaturas de laboratorio/fabricante más comunes en COBECA
export const LAB_ABREV = {
  meg: 'megalabs',
  megalabs: 'megalabs',
  bioq: 'bioquimica',
  bioquimica: 'bioquimica',
  plx: 'plusandex',
  plusandex: 'plusandex',
  varg: 'laboratorios vargas',
  vargas: 'laboratorios vargas',
  leti: 'laboratorios leti',
  'leti sau': 'laboratorios leti',
  pharme: 'sm pharma',
  smpharma: 'sm pharma',
  vlm: 'valmor',
  valmor: 'valmor',
  cofa: 'cofasa',
  cofasa: 'cofasa',
  elm: 'elmor',
  elmor: 'elmor',
  far: 'laboratorios farma',
  farma: 'laboratorios farma',
  biotech: 'biotech laboratorios',
  clx: 'calox international',
  calox: 'calox international',
  krka: 'krka',
  roemmers: 'roemmers',
  gador: 'gador',
  bago: 'bago',
  winthrop: 'winthrop',
  bayer: 'bayer',
  pfizer: 'pfizer',
  gsk: 'glaxosmithkline',
  msd: 'merck',
  novartis: 'novartis',
  abbott: 'abbott',
  sanofi: 'sanofi',
  goicochea: 'goicochea',
};

// Normaliza: minúsculas, sin acentos, un solo espacio, solo [a-z0-9 ]
export function normalizar(s = '') {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function expandirAbreviatura(token) {
  const t = normalizar(token);
  const clave = t.replace(/[.,]/g, '');
  if (FORMAS_ABREV[clave]) return FORMAS_ABREV[clave];
  if (MOL_ABREV[clave]) return MOL_ABREV[clave];
  return clave;
}

// Distancia de Levenshtein
export function leven(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const alen = a.length, blen = b.length;
  // Limitar tamaño de la matriz para descripciones largas
  const prev = new Array(blen + 1);
  const curr = new Array(blen + 1);
  for (let j = 0; j <= blen; j++) prev[j] = j;
  for (let i = 0; i < alen; i++) {
    curr[0] = i + 1;
    for (let j = 0; j < blen; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr[j + 1] = Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    }
    for (let j = 0; j <= blen; j++) prev[j] = curr[j];
  }
  return prev[blen];
}

// Similaridad de tokens (0..1)
export function tokenSim(a, b) {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - leven(a, b) / maxLen;
}

// Detecta si un token es concentración (número con unidad como mg/ml/g/ug/iu/+/%)
const CONCENTRACION_RE = /^\d+[.,]?\d*\s*(mg|ml|g|ug|iu|mcg|ui|unidades|unidad|%|gr)?$/i;
export function esConcentracion(token) {
  const t = normalizar(token);
  return /^\d/.test(t) && /(mg|ml|g|ug|iu|mcg|ui|un|%|,|\.)/.test(t) && !(/^x\d/.test(t));
}

// Extrae el tamaño de pack (unidades) de una descripción COBECA cruda.
// Busca "X10", "X 20", "X30" etc. ignorando unidades de medida (X10MG → no es pack).
export function extraerPackDesc(desc) {
  const m = String(desc || '').match(/\bX\s*(\d+)\b(?!\s*(ml|mg|mcg|g|ug|ui|iu|%))/i);
  return m ? Number.parseInt(m[1], 10) : null;
}

// Extrae el tamaño de pack del nombre_comercial de la BD.
// Busca "X 20", "X10" etc. en el nombre (ej. "KETOPROFENO 100 mg X 20 CAPSULAS").
export function extraerPackNombre(nombre) {
  const m = String(nombre || '').match(/\bX\s+(\d+)\b/i);
  return m ? Number.parseInt(m[1], 10) : null;
}

// Parse de la forma farmacéutica: devuelve el token expandido de forma si existe
export function detectarForma(rawTokens) {
  // Buscar el token que expande a una forma
  for (const tok of rawTokens) {
    const clave = normalizar(tok);
    if (FORMAS_ABREV[clave]) return FORMAS_ABREV[clave];
    // Comprobar tokens compuestos como "TAB DISP", "TAB REC", "CAP BLD"
    if (['tab', 'tabs', 'cap', 'caps', 'comp', 'com'].includes(clave)) {
      // combinaciones de dos tokens
      // 'tab' solo -> formas
      return FORMAS_ABREV[clave];
    }
  }
  return null;
}

// Detecta concentración decimal simple en la descripción cruda, ej. "1,25MG",
// "2,5MG", "1.5MG". Devuelve { valor, unidad } o null.
export function detectarConcDecimal(desc) {
  const m = String(desc || '').match(
    /(\d+[.,]\d+)\s*(mg|ml|g|ug|iu|mcg|ui|%)/i
  );
  if (!m) return null;
  return { valor: m[1].replace(',', '.'), unidad: m[2].toLowerCase() };
}

// Detecta concentración combinada en la descripción cruda, ej. "5/6,25MG",
// "2,5MG/6,25MG", "10/6,25MG", "5 - 6,25 mg". Devuelve { a, b, unidad } o null.
// La segunda unidad debe ser de dosis sólida (mg/g/ug/mcg/iu/ui): "250MG/5ML"
// (concentración en volumen de suspensión) NO es una combinación de principios.
export function detectarConcCombo(desc) {
  const s = String(desc || '');
  const m = s.match(
    /(\d+(?:[.,]\d+)?)\s*(?:mg|g|ug|mcg|iu|ui)?\s*[/-]\s*(\d+(?:[.,]\d+)?)\s*(mg|g|ug|mcg|iu|ui)/i
  );
  if (m) {
    return {
      a: m[1].replace(',', '.'),
      b: m[2].replace(',', '.'),
      unidad: m[3].toLowerCase(),
    };
  }
  // Par de dosis sin unidades (ej. "650/4 NOCHX"): el siguiente token NO puede
  // ser unidad de volumen/porcentaje ni otro número (eso sería "500MG/2ML" o
  // una tripleta "650/2/30MG" que ya captura la primera rama).
  const m2 = s.match(
    /(\d+(?:[.,]\d+)?)\s*[/-]\s*(\d+(?:[.,]\d+)?)(?!\s*(?:mg|g|ug|mcg|iu|ui|ml|cm|mm|un|gr|hr|lt|cc|%|[/-]))(?![0-9])/i
  );
  if (m2) {
    return {
      a: m2[1].replace(',', '.'),
      b: m2[2].replace(',', '.'),
      unidad: 'mg',
    };
  }
  return null;
}

// Parse de la descripción COBECA en tokens
export function parsearDescripcion(desc) {
  const norm = normalizar(desc);
  const rawTokens = norm.split(/\s+/);
  const molTokens = [];
  let conc = null;
  let forma = null;
  let labToken = null;

  // Concentración combinada (ej. "5/6,25mg"): se captura ANTES de normalizar
  // porque la "/" y la "," se destruyen al separar tokens.
  const combo = detectarConcCombo(desc);
  const concParts = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const tok = rawTokens[i];
    // Token de forma farmacéutica (exacto o con combinación)
    if (FORMAS_ABREV[tok]) {
      forma = FORMAS_ABREV[tok];
      continue;
    }
    // Combinaciones de dos tokens (TAB DISP, TAB REC, etc.) — la forma base
    if (tok === 'tab' && rawTokens[i+1] && !FORMAS_ABREV[rawTokens[i+1]] && !esConcentracion(rawTokens[i+1])) {
      forma = 'tabletas';
      i++;
      continue;
    }
    if ((tok === 'tab' || tok === 'tabs') && FORMAS_ABREV[rawTokens[i + 1]] && rawTokens[i+1] !== 'disp' && rawTokens[i+1] !== 'rec') {
      // TAB REC / TAB DISP: mantiene la forma base TABLETAS, el sufijo es info extra
      forma = 'tabletas';
      i++;
      continue;
    }
    // Concentración: contiene número con unidad
    if (esConcentracion(tok)) {
      concParts.push(tok);
      continue;
    }
    // Tokens X10, X30 (cantidad de presentación) — no son molécula ni concentración, saltar
    if (/^x\d+/.test(tok)) continue;
    // Tokens que solo son puntuación o volumen -> saltar (200ML, 30ML, etc.)
    if (/^\d+ml$/.test(tok)) { concParts.push(tok); continue; }
    if (/^\d+%.*/.test(tok)) { continue; }
    // Número + unidad como token independiente ("5 MG X 10"): concentración con
    // espacio entre el número y la unidad. Se une antes de descartar el número.
    if (/^\d+(?:[.,]\d+)?$/.test(tok) && i + 1 < rawTokens.length && /^(mg|ml|g|ug|iu|mcg|ui|%)$/.test(rawTokens[i + 1])) {
      concParts.push(`${tok}${rawTokens[i + 1]}`);
      i++;
      continue;
    }
    if (/^\d+$/.test(tok)) continue; // números sueltos (cantidad de unidades)

    // Stopwords (ruido de marca/presentación) que no aportan a la molécula
    if (STOPWORDS.has(tok)) continue;

    // resto: token de molécula o laboratorio
    molTokens.push(tok);
  }

  // Detección de laboratorio: el token solo es laboratorio si está en el mapa de
  // abreviaturas conocidas o parece una marca de la casa (token corto y no-palabra).
  const NO_LAB_VARIANTS = new Set(['dia', 'noche', 'noch', 'nochx4', 'supra']);
  labToken = null;
  if (molTokens.length > 1) {
    const ultimo = molTokens[molTokens.length - 1];
    const enLab = LAB_ABREV[ultimo];
    const pareceMarca = ultimo.length >= 2 && ultimo.length <= 4 && !STOPWORDS.has(ultimo) && !NO_LAB_VARIANTS.has(ultimo);
    if (enLab || pareceMarca) {
      labToken = ultimo;
    }
  }

  // Quitar el token de laboratorio de la lista de tokens de molécula
  let molFinal = molTokens;
  if (labToken) {
    molFinal = molTokens.slice(0, -1);
  }

  // Variante de marca (un solo carácter, p.ej. "H" en "CORENTEL H"): es un
  // discriminante de combinación (p.ej. H = +hidroclorotiazida), NO un token de
  // molécula. Se separa para que pese como criterio propio en matchScore.
  let variante = null;
  if (molFinal.length > 0) {
    const idxV = molFinal.findIndex((t) => /^[a-z]$/.test(t));
    if (idxV !== -1) {
      variante = molFinal.splice(idxV, 1)[0];
    }
  }

  conc = concParts.length > 0 ? concParts.join(' ') : null;
  // Concentración combinada (ej. "5/6,25mg"): usar los valores capturados del
  // crudo en vez del restaño que normalizar dejó ("25mg").
  let conc2 = null;
  if (combo) {
    conc = `${combo.a}${combo.unidad}`;
    conc2 = `${combo.b}${combo.unidad}`;
  } else if (/\d+[.,]\d+\s*(mg|ml|g|ug|iu|mcg|ui|%)/i.test(desc) && !conc) {
    // Concentración decimal simple tipo "2,5mg" / "2.5 MG": normalizar la parte
    // ("2 5 mg") perdió el número al separarlo en tokens sueltos, así que el
    // concParts quedó vacío. Recuperar el valor real desde el crudo.
    const dec = detectarConcDecimal(desc);
    if (dec) {
      conc = `${dec.valor}${dec.unidad}`;
    }
  } else if (conc && /^[0-9.,]+$/.test(String(conc).replace(/mg|ml|g|ug|iu|mcg|ui|%/g, ''))) {
    // Concentración decimal tipo "1,25mg" (normalizar dejó "25mg" al separar 1 y 25mg):
    // recuperar el valor real desde el crudo cuando el token parseado parece incompleto.
    const dec = detectarConcDecimal(desc);
    if (dec) {
      conc = `${dec.valor}${dec.unidad}`;
    }
  }

  return { molTokens: molFinal, conc, conc2, forma, labToken, variante, combo };
}

// Detecta el nombre de molécula normalizado desde un producto DB (molecula field)
// La columna molecula a veces incluye la concentración (ej. "DIPIRONA 500 MG")
export function limpiarMoleculaDb(molecula) {
  if (!molecula) return '';
  const norm = normalizar(molecula);
  // Quitar concentración del final (los números)
  const tokens = norm.split(/\s+/);
  const filtrados = tokens.filter(t => !/^\d/.test(t) && !/^(mg|ml|g|ug|iu|mcg|ui|un|%|unidades)$/.test(t));
  return filtrados.join(' ');
}

// Compara una cadena COBECA (descripción) con el nombre_comercial de la BD.
// Devuelve similitud 0..1 considerando marca + forma + concentración.
export function scoreNombreComercial(parseado, nombreComercialDb) {
  const nomDb = normalizar(nombreComercialDb || '');
  if (!nomDb) return 0;

  const tokensCobeca = parseado.molTokens.concat(parseado.conc ? parseado.conc.split(/\s+/) : []);
  const tokensDb = nomDb.split(/\s+/);

  let aciertos = 0;
  let totalCobeca = 0;
  for (const tc of tokensCobeca) {
    if (!tc) continue;
    totalCobeca++;
    let mejor = 0;
    for (const td of tokensDb) {
      if (td === tc) { mejor = 1; break; }
      // MARCA COMPUESTA PEGADA: un token DB es la concatenación de tc con otro
      // token de la MISMA desc (TERAGRIPFORTE = TERAGRIP + FORTE). Sin esto,
      // TERAGRIP pierde sus descs frente a marcas rivales de igual composición
      // (ANGRIP FORTE gana "TERAGRIP ... NOCHX4" porque tiene "forte" suelto).
      if (tc.length >= 4 && td.length > tc.length) {
        if (td.startsWith(tc)) {
          const resto = td.slice(tc.length);
          if (
            resto.length >= 3 &&
            tokensCobeca.some((o) => o && o !== tc && o.length >= 3 && resto === o)
          ) {
            mejor = 1;
            break;
          }
        }
        if (td.endsWith(tc)) {
          const resto = td.slice(0, td.length - tc.length);
          if (
            resto.length >= 3 &&
            tokensCobeca.some((o) => o && o !== tc && o.length >= 3 && resto === o)
          ) {
            mejor = 1;
            break;
          }
        }
      }
      const sim = tokenSim(tc, td);
      if (sim > mejor) mejor = sim;
    }
    // Los tokens de laboratorio (marca de la casa al final) pesan menos
    const esLab = parseado.labToken && tc === parseado.labToken;
    aciertos += mejor * (esLab ? 0.4 : 1);
  }
  if (totalCobeca === 0) return 0;

  // Normalizar por tokens únicos del nombre DB para no penalizar por longitud
  const base = Math.min(totalCobeca, tokensDb.length) || totalCobeca;
  return aciertos / (base * 1.0);
}

// Tokens de molécula "significativos" de la descripción COBECA: sin stopwords,
// sin formas, sin concentraciones, longitud >= 4. Son las palabras que anclan el
// fármaco real (ej. 'aciclovir', 'borico') y previenen falsos positivos.
export function tokensSignificativos(parseado) {
  const tokens = parseado.molTokens
    .map((t) => (FORMAS_ABREV[t] ? null : t))
    .filter((t) => t && t.length >= 4 && !STOPWORDS.has(t) && !esConcentracion(t) && !/^\d/.test(t))
    .map(expandirAbreviatura)
    .filter((t) => t.length >= 4);
  return tokens;
}

// Verifica que al menos un token significativo de la molécula COBECA matchee con
// el nombre o la molécula del producto BD (similitud >= ANCLA_UMBRAL). Si ningún
// token significativo matchea, el candidato es probablemente un falso positivo.
export function tieneAncla(parsed, productoDb, umbral = 0.72) {
  const sig = tokensSignificativos(parsed);
  if (sig.length === 0) return true; // sin ancla posible, no bloquea
  const textoDb = normalizar(`${productoDb.nombre_comercial || ''} ${productoDb.molecula || ''}`);
  const tokensDb = textoDb.split(/\s+/).filter((t) => t.length >= 3);
  for (const t of sig) {
    let mejor = 0;
    for (const td of tokensDb) {
      const s = tokenSim(t, td);
      if (s > mejor) mejor = s;
    }
    if (mejor >= umbral) return true;
  }
  return false;
}

// Índice de búsqueda rápida: mapea cada token clave -> lista de productos DB que
// lo contienen en nombre_comercial o molecula. Permite filtrar candidatos sin
// recorrer los 7.402 productos por cada fila COBECA.
export function construirIndice(productos) {
  const idx = new Map();
  for (const p of productos) {
    const pico = new Set();
    const nom = normalizar(`${p.nombre_comercial || ''} ${p.molecula || ''}`);
    for (const tok of nom.split(/\s+/)) {
      if (tok.length < 3) continue;          // tokens cortos no discriminan
      if (/^\d/.test(tok)) continue;          // números no discriminan
      const clave = expandirAbreviatura(tok);
      if (clave.length < 3) continue;
      pico.add(clave);
    }
    for (const clave of pico) {
      if (!idx.has(clave)) idx.set(clave, []);
      idx.get(clave).push(p);
    }
  }
  return idx;
}

export function candidatosPara(parsed, idx) {
  const set = new Map();
  const keys = [...idx.keys()];
  for (const tok of parsed.molTokens) {
    const clave = expandirAbreviatura(tok);
    if (clave.length < 3) continue;
    const exactos = idx.get(clave);
    const lista = exactos
      ? exactos
      : keys.filter((k) => clave.includes(k) || k.includes(clave)).flatMap((k) => idx.get(k));
    for (const p of lista) {
      set.set(p.id, { p, coincidencias: (set.get(p.id)?.coincidencias || 0) + 1 });
    }
  }
  return [...set.values()].sort((a, b) => b.coincidencias - a.coincidencias).map((e) => e.p);
}

// Dosis reales de un producto DB: extrae del molecula + nombre_comercial los
// valores numéricos de dosis con su unidad. Reconstruye decimales (normalizar
// borró la coma: "2,5 mg" quedó "2 5 mg", "1,25mg" quedó "1 25mg") de modo que
// el "5" de "2,5" NUNCA aparezca como dosis 5 mg (colisión que pegaba fotos de
// 5MG sobre productos de 2,5 mg).
export function dosisProductoDb(productoDb) {
  const texto = normalizar(`${productoDb.molecula || ''} ${productoDb.nombre_comercial || ''}`);
  const tokens = texto.split(/\s+/);
  const UNIDAD_DOSIS = /^(mg|g|ml|ug|mcg|iu|ui|%)$/;
  const dosis = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] || '';
    let dosisVal = null;
    // "25mg" — número con unidad pegada
    const mUni = /^(\d+(?:[.,]\d+)?)(mg|g|ml|ug|mcg|iu|ui|%)$/.exec(tok);
    if (mUni) {
      dosisVal = Number(mUni[1].replace(',', '.'));
    } else {
      const mNum = /^(\d+(?:[.,]\d+)?)$/.exec(tok);
      if (mNum) {
        const val = Number(mNum[1].replace(',', '.'));
        const sig = i + 1 < tokens.length ? tokens[i + 1] : '';
        // "5 mg" → 5 (unidad suelta al lado)
        if (UNIDAD_DOSIS.test(sig)) {
          dosisVal = val;
        } else {
          // Decimal partido: "2 5 mg" ó "2 5mg" → 2.5
          const sigNum = /^(\d+(?:[.,]\d+)?)(mg|g|ml|ug|mcg|iu|ui|%)?$/.exec(sig);
          const unidadDosPuntos = i + 2 < tokens.length ? UNIDAD_DOSIS.test(tokens[i + 2] || '') : false;
          if (sigNum && sigNum[1] && (sigNum[2] || unidadDosPuntos)) {
            const fracStr = sigNum[1].replace(',', '.');
            const frac = Number(fracStr);
            const decimales = (fracStr.split('.')[1] || fracStr).length;
            dosisVal = val + frac / Math.pow(10, decimales);
            i += 1; // consumir el siguiente token (su unidad ya forma parte del valor)
          }
        }
      }
    }
    if (dosisVal != null && isFinite(dosisVal) && dosisVal > 0 && dosisVal <= 5000) {
      dosis.add(Math.round(dosisVal * 100000) / 100000);
    }
  }
  return dosis;
}

// ¿La descripción COBECA es una combinación (HCT/doble dosis)? p.ej.
// "ANTAAR/HCT TAB 5MG/6,25MG", "BIOTALOL HCT". NO se usa la letra suelta
// ("ANG/H", "L.O"): la mayoría son ruido de laboratorio, no combinaciones.
// "160MG/5ML" (concentración en volumen) tampoco es una combinación.
function reDobleDosis() {
  return /(\d+(?:[.,]\d+)?)\s*(?:mg|g|ug|mcg|iu|ui)\s*[-/]\s*(\d+(?:[.,]\d+)?)\s*(?!\s*(?:ml|%))\s*(?:mg|g|ug|mcg|iu|ui)?/i;
}
export function esComboCobeca(parsed, descRaw) {
  if (parsed.combo) return true;
  const low = String(descRaw || '').toLowerCase();
  if (/(?:^|[^a-z])hct(?:[^a-z]|$)/.test(low)) return true;
  if (reDobleDosis().test(low)) return true;
  if (detectarConcCombo(low)) return true;
  return false;
}

// ¿El producto DB es una combinación? (doble dosis en el nombre, marcador
// hct/pe/h, o molécula compuesta con " - ").
export function esComboProducto(productoDb) {
  const nom = `${productoDb.nombre_comercial || ''} ${productoDb.molecula || ''}`;
  const low = nom.toLowerCase();
  if (reDobleDosis().test(low)) return true;
  if (/(?:^|[^a-z])hct(?:[^a-z]|$)/.test(low)) return true;
  if (/(?:^|[^a-z])pe(?:[^a-z]|$)/.test(low)) return true;
  const norm = normalizar(nom);
  if (/\bh\b/.test(norm)) return true;
  // Molécula compuesta ("ACETAMINOFEN - CAFEINA - CLORFENIRAMINA"): normalizar
  // destruye el guion, así que se detecta sobre la molécula original.
  if (/\s-\s/.test(productoDb.molecula || '')) return true;
  return false;
}

// Score de matching entre descripción COBECA (ya parseada) y un producto DB
// Combina: nombre comercial (peso alto), molécula (peso medio) y forma (peso medio),
// concentración (peso bajo) y pack size (desempate). Devuelve 0..1.
export function matchScore(descCobeca, productoDb, __debug) {
  const parsed = typeof descCobeca === 'string' ? parsearDescripcion(descCobeca) : descCobeca;
  const D = __debug ? {} : null;
  const ret = (fn) => (D ? { ...D, fin: fn() } : fn());
  const molTokens = parsed.molTokens.map(expandirAbreviatura);

  // Obtener la descripción cruda para extraer pack
  const descRaw = typeof descCobeca === 'string' ? descCobeca : (descCobeca._raw || '');

  const nomDb = normalizar(productoDb.nombre_comercial || '');
  const molDb = limpiarMoleculaDb(productoDb.molecula || '');
  const formaDb = normalizar(productoDb.forma || '');
  const labDb = normalizar(productoDb.laboratorio || '');

  let score = 0;
  let parts = 0;

  // Discriminación mono↔combinación: una descripción COBECA de combinación
  // (HCT, PE, doble dosis) NO debe pegarse a un producto de una sola molécula,
  // y viceversa (un foto de mono NUNCA debe caer en HCT). Se mantiene estricto:
  // los casos "mono con marca compuesta" (TERAGRIPSUPRA) se resuelven vía la
  // lista FORZADOS del loader (aprobados por el dueño), no relajando aquí —
  // una relajación por "marca" admitió falsos (ANTAAR mono→ANTAAR HCT,
  // BISOPROLOL→BISOPROLOL/HCT, ANGRIP foto→MEDIGRIP).
  const comboCobeca = esComboCobeca(parsed, descRaw);
  const comboDb = esComboProducto(productoDb);
  if (comboCobeca !== comboDb) {
    if (D) D.rejectCombo = `comboCobeca=${comboCobeca} comboDb=${comboDb}`;
    return ret(() => -1);
  }

  // 1) Nombre comercial (marca) — el criterio más fuerte (solo si existe)
  if (productoDb.nombre_comercial) {
    const nomScore = scoreNombreComercial(parsed, productoDb.nombre_comercial);
    score += nomScore * 0.45;
    parts += 0.45;
  }

  // 2) Molécula (peso medio) — verifica el fármaco real
  if (molTokens.length > 0 && molDb) {
    const molTokensDb = molDb.split(/\s+/);
    let sum = 0;
    let n = 0;
    for (const t of molTokens) {
      if (!t) continue;
      // Si el token es el laboratorio y ya lo usamos, lo tratamos más leve
      if (parsed.labToken && t === parsed.labToken) continue;
      let best = 0;
      for (const td of molTokensDb) {
        const sim = tokenSim(t, td);
        if (sim > best) best = sim;
      }
      sum += best;
      n++;
    }
    if (n > 0) {
      let molScore = sum / n;
      if (molDb.includes(molTokens.join(' '))) molScore = 1.0;
      score += molScore * 0.2;
      parts += 0.2;
    }
  }

  // 3) Forma farmacéutica (peso medio)
  if (parsed.forma && formaDb) {
    const formaCobeca = parsed.forma;
    let formaSim = formaDb.includes(formaCobeca) || formaCobeca.includes(formaDb) ? 1.0 : tokenSim(formaCobeca, formaDb);
    // Equivalencias (tabletas~comprimidos, suspension~polvo para suspension, etc.)
    if (formasSonEquivalentes(formaCobeca, formaDb)) {
      formaSim = 1.0;
    }
    score += formaSim * 0.2;
    parts += 0.2;
  }

  // 4) Concentración (peso bajo) — la dosis COBECA debe existir entre las dosis
  //    del producto DB (parseadas para evitar la colisión de decimales: en
  //    "2,5 mg" el "5" NUNCA debe contar como dosis 5 mg).
  let dosisDiscordante = false;
  if (parsed.conc && (productoDb.molecula || nomDb)) {
    const numCobeca = (parsed.conc.match(/\d+[.,]?\d*/) || [''])[0].replace(',', '.');
    const numCobecaB = parsed.conc2 ? (parsed.conc2.match(/\d+[.,]?\d*/) || [''])[0].replace(',', '.') : null;
    const numCobEval = Number(numCobeca);
    const dosisDb = dosisProductoDb(productoDb);
    // Concentración en volumen (jarabe/gotas, p.ej. "PED 120ML", "GTS 30ML"): es
    // el tamaño del envase, NO una dosis — no debe marcar discordancia contra las
    // dosis del producto (ej. TACHIPIRIN FORTE 160mg/5mL frente a "JBE 120ML").
    const esVolumen = (parsed.conc.match(/(mg|ml|g|ug|mcg|iu|ui|%)/) || [])[1] === 'ml';
    const concMatch = !esVolumen && isFinite(numCobEval) && dosisDb.has(numCobEval);

    // Dosis discordante: la descripción COBECA declara una dosis y el producto DB
    // declara dosis DISTINTAS (p.ej. COBECA "5MG" → producto "2,5 mg"). Rechaza el
    // match para no pegar fotos de presentaciones que no existen en la BD.
    if (!esVolumen && !concMatch && dosisDb.size > 0) {
      dosisDiscordante = true;
    }
    if (concMatch) score += 0.1;

    // Concentración combinada: si el segundo valor también aparece, refuerza
    if (numCobecaB && dosisDb.has(Number(numCobecaB))) {
      score += 0.05;
    }
    if (!esVolumen) parts += 0.1;
  }

  // 5) Laboratorio (peso bajo — a veces el lab no concuerda porque COBECA usa marcas)
  if (parsed.labToken && labDb) {
    const labCobeca = LAB_ABREV[parsed.labToken] || expandirAbreviatura(parsed.labToken);
    const labSim = labDb.includes(labCobeca) || labCobeca.includes(labDb) ? 1.0 : tokenSim(labCobeca, labDb);
    if (labSim > 0.5) {
      score += labSim * 0.05;
    }
    parts += 0.05;
  }

  // 6) Pack size (desempate) — si la descripción COBECA trae X10/X20/etc.,
  //    penaliza si el producto DB tiene un pack distinto (mismo fármaco, distinta cantidad).
  //    Peso: 0.15 (significativo pero no domina sobre molécula/forma/concentración).
  if (descRaw) {
    const packCobeca = extraerPackDesc(descRaw);
    const packDb = extraerPackNombre(productoDb.nombre_comercial || '');
    if (packCobeca != null && packDb != null) {
      if (packCobeca === packDb) {
        score += 1.0 * 0.15;
      }
      // Si no coinciden, no se suma nada (penaliza relativo al que sí coincide)
      parts += 0.15;
    }
  }

  // Dosis discordante (misma marca, dosis DISTINTA): el candidato es otra
  // presentación, no el producto buscado. Ahoga el score por debajo del umbral.
  if (dosisDiscordante) {
    if (D) D.rejectDosis = `dosisDb=[${[...dosisProductoDb(productoDb)].join(',')}] conc=${parsed.conc}`;
    return ret(() => -1);
  }

  if (D) {
    D.score = score;
    D.parts = parts;
    D.final = parts > 0 ? score / parts : 0;
    D.parsed = parsed;
    D.nomScore = productoDb.nombre_comercial ? scoreNombreComercial(parsed, productoDb.nombre_comercial) : 0;
    return D;
  }
  return parts > 0 ? score / parts : 0;
}
