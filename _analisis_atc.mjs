import fs from 'node:fs'
import pg from 'pg'

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

const q = async (label, sql) => {
  const { rows } = await client.query(sql)
  console.log(`\n===== ${label} =====`)
  console.table(rows)
}

// Cobertura de enlace a moleculas + ATC
await q('Cobertura producto_moleculas + ATC', `
  SELECT
    (SELECT COUNT(*) FROM productos) total,
    (SELECT COUNT(DISTINCT p.id) FROM productos p JOIN producto_moleculas pm ON pm.producto_id=p.id) con_molecula,
    (SELECT COUNT(DISTINCT p.id) FROM productos p
       JOIN producto_moleculas pm ON pm.producto_id=p.id
       JOIN moleculas_referencias mr ON mr.id=pm.molecula_id
       WHERE mr.atc_id IS NOT NULL) con_atc`)

// Nivel 1 ATC distribution (naming)
await q('Distribucion ATC nivel 1 (productos con ATC)', `
  WITH RECURSIVE l5 AS (
    SELECT mr.atc_id, p.id AS producto_id FROM productos p
      JOIN producto_moleculas pm ON pm.producto_id=p.id
      JOIN moleculas_referencias mr ON mr.id=pm.molecula_id
      WHERE mr.atc_id IS NOT NULL
  ),
  asc_tree AS (
    SELECT l5.producto_id, a.id, a.padre_id, a.nivel, a.codigo, a.nombre FROM atc_clasificaciones a
      JOIN l5 ON l5.atc_id=a.id
    UNION ALL
    SELECT t.producto_id, a.id, a.padre_id, a.nivel, a.codigo, a.nombre
      FROM atc_clasificaciones a JOIN asc_tree t ON a.id=t.padre_id
  )
  SELECT codigo, nombre, COUNT(DISTINCT producto_id) n_productos
  FROM asc_tree WHERE nivel=1 GROUP BY codigo, nombre ORDER BY 3 DESC`)

// Nivel 2 ATC distribution
await q('Distribucion ATC nivel 2 (top 40)', `
  WITH RECURSIVE l5 AS (
    SELECT mr.atc_id, p.id AS producto_id FROM productos p
      JOIN producto_moleculas pm ON pm.producto_id=p.id
      JOIN moleculas_referencias mr ON mr.id=pm.molecula_id
      WHERE mr.atc_id IS NOT NULL
  ),
  asc_tree AS (
    SELECT l5.producto_id, a.id, a.padre_id, a.nivel, a.codigo, a.nombre FROM atc_clasificaciones a
      JOIN l5 ON l5.atc_id=a.id
    UNION ALL
    SELECT t.producto_id, a.id, a.padre_id, a.nivel, a.codigo, a.nombre
      FROM atc_clasificaciones a JOIN asc_tree t ON a.id=t.padre_id
  )
  SELECT codigo, nombre, COUNT(DISTINCT producto_id) n_productos
  FROM asc_tree WHERE nivel=2 GROUP BY codigo, nombre ORDER BY 3 DESC LIMIT 40`)

// Moleculas sin ATC
await q('Productos con molecula pero ATC null / sin molecula', `
  SELECT
    (SELECT COUNT(DISTINCT p.id) FROM productos p
      JOIN producto_moleculas pm ON pm.producto_id=p.id
      JOIN moleculas_referencias mr ON mr.id=pm.molecula_id
      WHERE mr.atc_id IS NULL) con_molecula_sin_atc
  `)

await client.end()
