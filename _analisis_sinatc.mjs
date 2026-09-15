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

// Productos SIN ATC por linea y forma
await q('Sin ATC: linea x forma (top 25)', `
  WITH sin_atc AS (
    SELECT DISTINCT p.id, p.linea, p.forma, p.nombre_comercial FROM productos p
    WHERE p.id NOT IN (
      SELECT DISTINCT p2.id FROM productos p2
        JOIN producto_moleculas pm ON pm.producto_id=p2.id
        JOIN moleculas_referencias mr ON mr.id=pm.molecula_id
        WHERE mr.atc_id IS NOT NULL)
  )
  SELECT linea, COALESCE(forma,'(sin forma)') forma, COUNT(*) n FROM sin_atc
  GROUP BY linea, COALESCE(forma,'(sin forma)') ORDER BY 3 DESC LIMIT 25`)

// Muestra de nombres sin ATC (con palabra clave hospitalaria)
await q('Muestra nombres sin ATC (35)', `
  WITH sin_atc AS (
    SELECT DISTINCT p.id, p.linea, p.forma, p.nombre_comercial, pc.categoria FROM productos p
    LEFT JOIN productos_catalogo pc ON pc.ef=p.fuente_inhrr_ef
    WHERE p.id NOT IN (
      SELECT DISTINCT p2.id FROM productos p2
        JOIN producto_moleculas pm ON pm.producto_id=p2.id
        JOIN moleculas_referencias mr ON mr.id=pm.molecula_id
        WHERE mr.atc_id IS NOT NULL)
  )
  SELECT nombre_comercial, linea, COALESCE(forma,'') forma, COALESCE(categoria,'') cat FROM sin_atc
  ORDER BY nombre_comercial LIMIT 35`)

await client.end()