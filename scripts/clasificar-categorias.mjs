// scripts/clasificar-categorias.mjs
// Backfill (idempotente) de producto_categorias a partir de CATEGORIAS_TIENDA.
// Clasificación por producto, con estas fuentes en orden:
//   1. ATC: códigos ATC (y ancestros) de las moléculas enlazadas (producto_moleculas).
//   2. Keywords: coincidencia de texto sobre molecula + nombre_comercial (sin acentos).
//   3. Formas farmacéuticas (campo forma) por categoría.
//   4. Residuo material -> 'hospitalario' si linea hospitalaria / forma INYECTABLE.
// Un producto puede quedar en VARIAS categorías (multi-categoría).
// Ejecutar tras aplicar 032_categorias_tienda.sql. Idempotente (TRUNCATE + reinsert).

import fs from 'node:fs'
import pg from 'pg'
import { CATEGORIAS_TIENDA } from '../src/config/categoriasTienda.js'

const env = {}
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const client = new pg.Client({
  host: env.SUPABASE_DB_HOST,
  port: Number(env.SUPABASE_DB_PORT),
  database: env.SUPABASE_DB_NAME,
  user: env.SUPABASE_DB_USER,
  password: env.SUPABASE_DB_PASSWORD,
})
await client.connect()

const normalize = (s = '') =>
  s
    .toUpperCase()
    .replace(/[ÁÀÄÂÃ]/g, 'A')
    .replace(/[ÉÈËÊ]/g, 'E')
    .replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔÕ]/g, 'O')
    .replace(/[ÚÙÜÛ]/g, 'U')
    .replace(/[Ý]/g, 'Y')
    .replace(/Ñ/g, 'N')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ── Datos ──────────────────────────────────────────────────────────────
const { rows: productos } = await client.query(
  `SELECT id, nombre_comercial, molecula, forma, linea,
          COALESCE(nombre_comercial,'') || ' ' || COALESCE(molecula,'') AS haystack
   FROM productos`
)

const { rows: moleculas } = await client.query(
  `SELECT mr.id, mr.atc_id FROM producto_moleculas pm
   JOIN moleculas_referencias mr ON mr.id = pm.molecula_id`
)

const { rows: atcRows } = await client.query(
  `SELECT id, codigo, padre_id FROM atc_clasificaciones`
)
const atcById = new Map(atcRows.map((a) => [a.id, a]))

// Codigos ATC (nodo + todos los ancestros) de cada molecula
const molCodigos = new Map()
for (const m of moleculas) {
  if (!m.atc_id) continue
  const ids = []
  let cur = atcById.get(m.atc_id)
  let guard = 0
  while (cur && guard < 10) {
    ids.push(cur.id)
    cur = cur.padre_id != null ? atcById.get(cur.padre_id) : null
    guard++
  }
  molCodigos.set(m.id, ids)
}

// Mapa producto -> { atcCodes, hayStackNorm, formaNorm }
const porProducto = new Map()
for (const p of productos) {
  porProducto.set(p.id, {
    nombre: p.nombre_comercial,
    hay: normalize(p.nombre_comercial + ' ' + (p.molecula || '')),
    forma: normalize(p.forma || ''),
    linea: p.linea,
    atcCodes: new Set(),
  })
}

// monto moleculas en productos
const { rows: pmRows } = await client.query(
  'SELECT producto_id, molecula_id FROM producto_moleculas'
)
for (const pm of pmRows) {
  const prod = porProducto.get(pm.producto_id)
  const codes = molCodigos.get(pm.molecula_id)
  if (!prod || !codes) continue
  for (const id of codes) {
    const n = atcById.get(id)
    if (n && n.codigo) prod.atcCodes.add(n.codigo)
  }
}

// matcher prefix
const matcheaAtc = (codes, prefixes) =>
  prefixes.some((pref) => {
    const p = normalize(pref) || ''
    if (!p) return false
    return [...codes].some((c) => c === p || c.startsWith(p))
  })

// matcher de keyword con limites de palabra:
//  - <5 chars  -> palabra exacta (\bKW\b), evita falsos como 'tos' dentro de 'RECUBIERTOS'
//  - con espacio -> frase exacta (\bKW1\s+KW2\b)
//  - >=5 chars -> prefijo de token (\bKW), permite stemming (acetaminof -> ACETAMINOFEN)
const reKw = (kw) => {
  const n = normalize(kw)
  if (!n) return null
  if (n.includes(' ')) return new RegExp(`\\b${n.split(/\s+/).join('\\s+')}\\b`)
  return n.length < 5 ? new RegExp(`\\b${n}\\b`) : new RegExp(`\\b${n}`)
}
const rePorCategoria = CATEGORIAS_TIENDA.map((c) => ({
  id: c.id,
  re: (c.keywords || []).map(reKw).filter(Boolean),
}))
const matcheaKeyword = (hay, re) => re.some((r) => r.test(hay))

// Guarda de "señal tópica": piel y ojos-oidos solo se asignan si el producto
// tiene forma/propósito tópico, oftálmico u ótico. Evita que presentaciones
// SISTÉMICAS (tabl./caps./jarabe) entren a piel solo porque su molécula tiene
// un ATC tópico en moleculas_referencias (ej. diclofenaco D11AX18, clorfenamina
// D04AA91, brimonidina D11AX21 — datos de origen por-molécula, no por-vía).
const FORMAS_TOPICAS = new Set([
  'CREMA', 'UNGUENTO', 'POMADA', 'LOCION', 'GEL', 'JABON', 'SHAMPOO', 'CHAMPU',
  'EMULSION', 'BARRA', 'SOLUCION TOPICA', 'SOLUCION OFTALMICA', 'SOLUCION OTICA',
  'GEL OFTALMICO', 'SUSPENSION OFTALMICA', 'POMADA OFTALMICA', 'COLIRIO', 'ESPUMA',
  'POLVO TOPICO', 'TOPIQUE', 'LOCION CAPILAR',
])
const FORMAS_OFTALMO_OTICAS = new Set([
  'SOLUCION OFTALMICA', 'SOLUCION OTICA', 'GEL OFTALMICO', 'SUSPENSION OFTALMICA',
  'POMADA OFTALMICA', 'COLIRIO',
])
const RE_SEÑAL_TOPICA =
  /\b(CREMA|UNGUENTO|POMADA|LOCION|GEL O|JABON|SHAMPOO|CHAMPU|EMULSION|BARRA|TOPICA|TOPICO|COLIRIO|OFTA|OTIC|OCULAR|ESPUMA|TOPIQUE|VASELINA|LANOLINA|EMOLIENTE|HUMECTANTE|HIDRATANTE|ACNE|CICATRIZ)\b/
const RE_OFTA_OTICO = /\b(OFTA|OTIC|OCULAR|COLIRIO|LAGRIMAS|LAGRIMA)\b/
const CATEGORIAS_CON_GUARDA = new Set(['piel', 'ojos-oidos'])
const esTopica = (prod) =>
  FORMAS_TOPICAS.has(prod.forma) || RE_SEÑAL_TOPICA.test(prod.hay)

// ── Clasificar ─────────────────────────────────────────────────────────
const asignaciones = [] // [producto_id, categoria]
const sinCategoria = []

for (const p of productos) {
  const prod = porProducto.get(p.id)
  const cats = new Set()

  // 1. ATC
  for (const cfg of CATEGORIAS_TIENDA) {
    if (cfg.atc.length && matcheaAtc(prod.atcCodes, cfg.atc)) cats.add(cfg.id)
  }

  // 2. Keywords (todas las categorias, multi)
  for (const c of rePorCategoria) {
    if (matcheaKeyword(prod.hay, c.re)) cats.add(c.id)
  }

  // 3. Formas
  for (const cfg of CATEGORIAS_TIENDA) {
    if (!cfg.formas) continue
    if (prod.forma && cfg.formas.map(normalize).includes(prod.forma)) cats.add(cfg.id)
  }

  // 3b. Guarda de señal tópica (piel / ojos-oidos): si el producto no presenta
  // forma ni indicio tópico, se quita de esas categorías aunque su ATC las marque.
  if (cats.has('piel') || cats.has('ojos-oidos')) {
    const topica = esTopica(prod)
    if (!topica) {
      cats.delete('piel')
      cats.delete('ojos-oidos')
    }
  }
  // 3c. Lo manifiestamente oftálmico/ótico NO va a piel (su ATC tópico podría
  // haberlo colado): solo ojos-oidos.
  if (RE_OFTA_OTICO.test(prod.hay) || FORMAS_OFTALMO_OTICAS.has(prod.forma)) {
    cats.delete('piel')
  }

  // 4. Residuo -> hospitalario (solo si no quedo en ninguna)
  if (cats.size === 0) {
    const esHospital = prod.linea === 'Linea Hospitalaria' || prod.forma === 'INYECTABLE'
    if (esHospital) cats.add('hospitalario')
  }

  if (cats.size === 0) {
    sinCategoria.push(p.nombre_comercial)
  } else {
    for (const c of cats) asignaciones.push([p.id, c])
  }
}

// ── Persistir (idempotente) ────────────────────────────────────────────
let intento = 0
while (true) {
  intento++
  try {
    await client.query('SET lock_timeout = \'3s\'')
    await client.query('BEGIN')
    await client.query('TRUNCATE producto_categorias')
    if (asignaciones.length) {
      await client.query(
        `INSERT INTO producto_categorias (producto_id, categoria)
         SELECT v.producto_id, v.categoria
         FROM unnest($1::int[], $2::text[]) AS v(producto_id, categoria)`,
        [asignaciones.map((a) => a[0]), asignaciones.map((a) => a[1])]
      )
    }
    await client.query('COMMIT')
    break
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err.code === '40P01' && intento < 3) {
      console.log('deadlock, reintento', intento)
      await new Promise((r) => setTimeout(r, 1500))
    } else {
      console.error('ERROR persistencia:', err.message)
      process.exit(1)
    }
  }
}

// ── Reporte ────────────────────────────────────────────────────────────
const { rows: conteos } = await client.query(
  `SELECT c.id, c.nombre, c.orden, COUNT(pc.producto_id)::int n
   FROM categorias_tienda c
   LEFT JOIN producto_categorias pc ON pc.categoria = c.id
   GROUP BY c.id, c.nombre, c.orden ORDER BY c.orden`
)
console.log('\n=== Conteo por categoria ===')
console.table(conteos)

const { rows: totalAsig } = await client.query(
  'SELECT COUNT(*)::int n, COUNT(DISTINCT producto_id)::int productos FROM producto_categorias'
)
console.log('Asignaciones:', totalAsig[0].n, '| productos con alguna categoria:', totalAsig[0].productos, '| total productos:', productos.length)

const fecha = new Date().toISOString().slice(0, 10)
if (sinCategoria.length) {
  const csv = 'nombre_comercial\n' + sinCategoria.map((n) => `"${n.replace(/"/g, '""')}"`).join('\n')
  fs.writeFileSync(`data/productos_sin_categoria_${fecha}.csv`, csv)
  console.log(`\nSin categoría: ${sinCategoria.length} -> data/productos_sin_categoria_${fecha}.csv`)
} else {
  console.log('\nSin categoría: 0')
}

await client.end()