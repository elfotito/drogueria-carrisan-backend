// scripts/lib/farmanselmoParser.mjs
// Matcher adaptado para nombres COMPLETOS de Farmanselmo (no abreviados como COBECA).
// Detecta forma farmacéutica completa (TABLETAS, SOLUCION OFTALMICA, CREMA...),
// extrae dosis y ancla por MOLECULA estricta contra la columna molecula de la BD.
// Funciones puras, sin BD.

import { normalizar, tokenSim, FORMAS_EQUIV, limpiarMoleculaDb, dosisProductoDb, esComboProducto } from './cobecaParser.mjs';

// ¿El nombre Farmanselmo describe una combinación de principios activos?
// Marcadores: "+" entre ingredientes (MONTELUKAST+DESLORATADINA), HCT,
// doble dosis sólida (875MG/125MG, 160MG+10MG, 40MG/25MG). Un "150MG/5ML"
// NO es combo (es concentración en volumen), y un "x30" es pack.
export function esComboNombreFarmanselmo(nombre) {
  const s = String(nombre || '');
  if (/(?:^|[^a-z0-9])\+(?:[^a-z0-9]|$)/i.test(s)) {
    // "+" suelto (porcentajes no) — solo interesa "+" entre letras/números
  }
  if (/([a-z0-9])+\s*\+\s*([a-z0-9])/i.test(s)) return true;
  if (/(?:^|[^a-z])hct(?:[^a-z]|$)/i.test(s)) return true;
  // ACEBROFILINA = segundo principio activo de un combo sin marcador "+"
  // (ej. "AMBROXOL ACEBROFILINA JARABE"): una foto de combo NO pega a un
  // producto de una sola molécula.
  if (/(?:^|[^a-z])acebrofilina(?:[^a-z]|$)/i.test(s)) return true;
  // ACEBROFILINA = segundo principio activo de un combo sin marcador "+"
  // (p.ej. "AMBROXOL ACEBROFILINA JARABE"): una foto de combo NO pega a un producto mono.
  if (/(?:^|[^a-z])acebrofilina(?:[^a-z]|$)/i.test(s)) return true;
  // "beclometasona" suele venir con "+" (VENTODUO SALBUTAMOL+BECLOMETASONA), pero el
  // nombre a veces lo declara junto sin "+": "SERETIDE SALMETEROL FLUTICASONA".

  if (/(\d+(?:[.,]\d+)?)\s*(?:mg|g|ug|mcg|iu|ui)\s*[/+]\s*(\d+(?:[.,]\d+)?)\s*(?:mg|g|ug|mcg|iu|ui)/i.test(s)) return true;
  return false;
}

// Frases de forma completa (normalizadas) -> forma canónica (clave de FORMAS_EQUIV).
// Orden: primero las más largas para que "solucion en gotas" gane sobre "solucion".
const FRASES_FORMA = [
  'polvo para solucion inyectable',
  'solucion oftalmica',
  'solucion inyectable',
  'jeringa prellenada',
  'solucion en gotas',
  'solucion ototopica',
  'polvo para suspension oral',
  'polvo para reconstitucion',
  'solucion nasal',
  'solucion topica',
  'suspension oral',
  'solucion oral',
  'tabletas recubiertas',
  'comprimidos recubiertos',
  'tabletas masticables',
  'polvo para suspension',
  'suspension',
  'comprimidos',
  'tabletas',
  'capsulas',
  'capsula',
  'tableta',
  'inyectable',
  'ampollas',
  'ampolla',
  'unguento',
  'pomada',
  'jarabe',
  'supositorios',
  'champu',
  'jabon',
  'ovulos',
  'crema',
  'locion',
  'polvo',
  'solucion',
  'gotas',
  'sobre',
  'granulados',
  'gel',
  'spray',
  'aerosol',
  'pastilla',
  'tintura',
  'parche',
  'liofilizado',
  'emulsion',
  'dental',
].map((f) => normalizar(f));

const CANONICA = {
  'polvo para solucion inyectable': 'jeringa prellenada',
  'solucion oftalmica': 'solucion oftalmica',
  'solucion inyectable': 'solucion inyectable',
  'jeringa prellenada': 'jeringa prellenada',
  'solucion en gotas': 'gotas',
  'solucion ototopica': 'solucion ototopica',
  'polvo para suspension oral': 'suspension oral',
  'polvo para reconstitucion': 'polvo para reconstitucion',
  'polvo para suspension': 'suspension oral',
  'solucion nasal': 'solucion nasal',
  'solucion topica': 'solucion topica',
  'solucion oral': 'solucion oral',
  'suspension oral': 'suspension oral',
  'suspension': 'suspension',
  'tabletas recubiertas': 'tabletas',
  'comprimidos recubiertos': 'comprimidos',
  'tabletas masticables': 'masticable',
  'comprimidos': 'comprimidos',
  'tabletas': 'tabletas',
  'tableta': 'tabletas',
  'capsulas': 'capsulas',
  'capsula': 'capsulas',
  'inyectable': 'solucion inyectable',
  'ampollas': 'solucion inyectable',
  'ampolla': 'solucion inyectable',
  'unguento': 'unguento',
  'pomada': 'pomada',
  'jarabe': 'jarabe',
  'supositorios': 'supositorios',
  'champu': 'champu',
  'jabon': 'jabon',
  'ovulos': 'ovulos',
  'crema': 'crema',
  'locion': 'locion',
  'polvo': 'polvo',
  'solucion': 'solucion',
  'gotas': 'gotas',
  'sobre': 'sobre',
  'granulados': 'granulados',
  'gel': 'gel',
  'spray': 'spray',
  'aerosol': 'aerosol',
  'pastilla': 'pastilla',
  'tintura': 'tintura',
  'parche': 'parche',
  'liofilizado': 'liofilizado',
  'emulsion': 'emulsion',
  'dental': 'solucion',
};

// Detecta la forma farmacéutica completa en un nombre Farmanselmo.
export function detectarFormaNombre(nombre) {
  const n = normalizar(nombre || '');
  if (!n) return null;
  for (const frase of FRASES_FORMA) {
    // Buscar la frase como palabra/término (con límites no-alfanuméricos)
    const re = new RegExp(`(^|[^a-z0-9])${frase.replace(/ /g, ' ')}($|[^a-z0-9])`);
    if (re.test(n)) return CANONICA[frase] || frase;
  }
  return null;
}

const DOSIS_RE = /(\d+(?:[.,]\d+)?)\s*(mg|g|ug|mcg|iu|ui|%|gr)\b/gi;

// Extrae dosis sólidas declaradas en el nombre Farmanselmo (mg, g, %, UI...).
export function dosisFarmanselmo(nombre) {
  const s = String(nombre || '');
  const dosis = new Set();
  let m;
  DOSIS_RE.lastIndex = 0;
  while ((m = DOSIS_RE.exec(s)) !== null) {
    const val = parseFloat(m[1].replace(',', '.'));
    if (isFinite(val) && val > 0 && val <= 5000) {
      dosis.add(Math.round(val * 100000) / 100000);
    }
  }
  return dosis;
}

const SALES = new Set(['clorhidrato', 'clorhidratado', 'sodico', 'potasico', 'acido', 'hidratado', 'bromuro', 'disodico', 'calcium', 'trihidrato', 'monohidrato']);

// Componentes de la molécula de BD (columna molecula) dividida por " - " ó ";".
// Se divide por el texto CRUDO antes de normalizar (normalizar destruye el guion).
// Cada componente se reduce a sus tokens significativos sin sales / frases.
export function componentesMolecula(moleculaDb) {
  if (!moleculaDb) return [];
  return String(moleculaDb)
    .split(/[;-]/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) =>
      normalizar(c)
        .split(/\s+/)
        .map((t) => t.replace(/[^a-z]/g, ''))
        .filter((t) => t.length >= 4 && !SALES.has(t))
    )
    .filter((t) => t.length > 0);
}

// Verdadero si TODOS los componentes de la molécula DB aparecen (ancla) en el
// nombre Farmanselmo (similitud >= umbral por componente => al menos un token).
export function anclaMolecula(componentes, nombreFarm, umbral = 0.74) {
  if (componentes.length === 0) return null; // sin ancla posible
  const tokensFarm = normalizar(nombreFarm || '').split(/\s+/).filter((t) => t.length >= 3);
  if (tokensFarm.length === 0) return false;
  for (const comp of componentes) {
    let mejor = 0;
    for (const tkComp of comp) {
      for (const tf of tokensFarm) {
        const s = tokenSim(tkComp, tf);
        if (s > mejor) mejor = s;
      }
    }
    if (mejor < umbral) return false;
  }
  return true;
}

// Formas compatibles entre la forma detectada en Farmanselmo y la forma de BD.
export function formasCompatibles(formaFarm, formaDb) {
  if (!formaFarm && !formaDb) return true;
  if (!formaFarm) return true; // sin forma en Farmanselmo, no bloquea
  if (!formaDb) return true;
  const fdb = normalizar(formaDb);
  const lista = FORMAS_EQUIV[formaFarm];
  if (!lista) return fdb.includes(formaFarm) || formaFarm.includes(fdb);
  return lista.some((f) => fdb.includes(f));
}

// Componentes adicionales del nombre_comercial cuando declara doble dosis
// (combo real aunque la columna molecula esté incompleta, p.ej.
// "AMBROXOL-CLENBUTEROL 7,5 mg-0,005 mg/5 mL" con molecula="Ambroxol").
// Se toman los tokens del prefijo del nombre hasta la primera dosis y se
// dividen por guion; cada segmento se reduce a tokens significativos.
function componentesDeNombreCombo(productoDb) {
  const nom = String(productoDb?.nombre_comercial || '');
  const dosisRe = /(\d+(?:[.,]\d+)?)\s*(?:mg|g|ug|mcg|iu|ui)/i;
  const m = dosisRe.exec(nom);
  if (!m) return [];
  const prefijo = nom.slice(0, m.index);
  const partes = prefijo.split(/[/;]/).map((t) => t.trim()).filter(Boolean);
  const comps = [];
  for (const parte of partes) {
    const tokens = normalizar(parte)
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z]/g, ''))
      .filter((t) => t.length >= 4 && !SALES.has(t));
    if (tokens.length) comps.push(tokens);
  }
  return comps;
}

// Score completo (0..1) entre un nombre Farmanselmo y un producto de la BD.
// Devuelve -1 si hay rechazo duro (forma incompatible o dosis discordante).
export function scoreFarmanselmo(nombreFarm, productoDb) {
  const componentes = componentesMolecula(productoDb.molecula);
  if (componentes.length === 0) return -1;

  // Si el nombre comercial del producto es un combo real (doble dosis), exigir
  // también sus componentes nominales (la columna molecula puede estar incompleta).
  if (esComboProducto(productoDb)) {
    for (const extra of componentesDeNombreCombo(productoDb)) {
      if (!componentes.some((c) => JSON.stringify(c) === JSON.stringify(extra))) {
        componentes.push(extra);
      }
    }
  }
  const formaFarm = detectarFormaNombre(nombreFarm);
  const formaDb = productoDb.forma;

  const ancla = anclaMolecula(componentes, nombreFarm);
  if (ancla === false) return -1;
  if (!formasCompatibles(formaFarm, formaDb)) return -1;

  // Gate mono↔combo: una foto de combinación NO debe pegarse a un producto de
  // una sola molécula, ni una foto de monofármaco a un producto combinado.
  // (Misma lógica que esComboCobeca/esComboProducto del parser COBECA.)
  const comboFarm = esComboNombreFarmanselmo(nombreFarm);
  const comboDb = esComboProducto(productoDb);
  if (comboFarm !== comboDb) return -1;

  // Dosis: si ambas partes declaran dosis sólidas y NO hay intersección -> rechazo.
  const dosisF = dosisFarmanselmo(nombreFarm);
  const dosisP = dosisProductoDb(productoDb);
  let dosisCoincide = true;
  if (dosisF.size > 0 && dosisP.size > 0) {
    let inter = null;
    for (const d of dosisF) {
      if (dosisP.has(d)) { inter = d; break; }
    }
    dosisCoincide = inter !== null;
  }
  if (!dosisCoincide) return -1;

  // Score base
  let score = 0;
  if (ancla === true) score += 0.55;
  if (formaFarm && formasCompatibles(formaFarm, formaDb)) score += 0.2;
  if (dosisF.size > 0) {
    if (dosisCoincide && dosisP.size > 0) score += 0.15;
    else if (dosisP.size === 0) score += 0.1;
  }
  // Bono por dosis exacta compartida
  if (dosisF.size > 0 && dosisP.size > 0) {
    let inter = null;
    for (const d of dosisF) if (dosisP.has(d)) { inter = d; break; }
    if (inter !== null) score += 0.1;
  }
  // Bono si el nombre_comercial del producto coincide (marca genérica exacta)
  const nomCom = normalizar(productoDb.nombre_comercial || '');
  if (nomCom && normalizar(nombreFarm).includes(nomCom)) score += 0.05;

  return Math.min(score, 1);
}