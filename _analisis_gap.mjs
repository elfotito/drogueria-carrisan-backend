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

await q('Matriz: molecula_text vs bridge_atc', `
  SELECT
    CASE WHEN p.molecula IS NOT NULL THEN 'molecula_si' ELSE 'molecula_no' END mol_txt,
    CASE WHEN pm.id IS NOT NULL AND mr.atc_id IS NOT NULL THEN 'atc_si'
         WHEN pm.id IS NOT NULL THEN 'bridge_sin_atc'
         ELSE 'sin_bridge' END estado,
    COUNT(*) n
  FROM productos p
  LEFT JOIN producto_moleculas pm ON pm.producto_id = p.id
  LEFT JOIN moleculas_referencias mr ON mr.id = pm.molecula_id
  GROUP BY 1,2 ORDER BY 1,2`)

await q('Acetaminofen: texto molecula vs bridge', `
  SELECT
    CASE WHEN pm.id IS NOT NULL AND mr.atc_id IS NOT NULL THEN 'atc_si'
         WHEN pm.id IS NOT NULL THEN 'bridge_sin_atc'
         ELSE 'sin_bridge' END estado,
    COUNT(*) n
  FROM productos p
  LEFT JOIN producto_moleculas pm ON pm.producto_id = p.id
  LEFT JOIN moleculas_referencias mr ON mr.id = pm.molecula_id
  WHERE p.molecula ILIKE '%acetaminof%' OR p.nombre_comercial ILIKE '%acetaminof%'
  GROUP BY 1`)

await q('Acetaminofen en bridge: ids molecula', `
  SELECT mr.id, mr.nombre, COUNT(DISTINCT p.id) n
  FROM productos p
  JOIN producto_moleculas pm ON pm.producto_id = p.id
  JOIN moleculas_referencias mr ON mr.id = pm.molecula_id
  WHERE p.molecula ILIKE '%acetaminof%' OR p.nombre_comercial ILIKE '%acetaminof%'
  GROUP BY 1,2`)

await q('molecula text: cuantas tienen texto y cual es el proceso de propagacion', `
  SELECT COUNT(*) total, COUNT(p.molecula) con_texto, COUNT(DISTINCT p.molecula) moles_distintas FROM productos p`)

await client.end()