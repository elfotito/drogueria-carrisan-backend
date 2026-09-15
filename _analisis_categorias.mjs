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
  return rows
}

await q('DISTINCT linea (productos)', `SELECT linea, COUNT(*) FROM productos GROUP BY linea ORDER BY 2 DESC`)
await q('TOP 30 forma (productos)', `SELECT forma, COUNT(*) FROM productos WHERE forma IS NOT NULL GROUP BY forma ORDER BY 2 DESC LIMIT 30`)
await q('linea + forma cross (top)', `
  SELECT linea, forma, COUNT(*) c
  FROM productos
  WHERE linea IS NOT NULL AND forma IS NOT NULL
  GROUP BY linea, forma HAVING COUNT(*) >= 5
  ORDER BY 3 DESC LIMIT 40`)

await q('TOP 40 molecula (productos)', `
  SELECT molecula, COUNT(*) FROM productos WHERE molecula IS NOT NULL GROUP BY molecula ORDER BY 2 DESC LIMIT 40`)

await q('Distribucion categoria catalogo de productos (via ef)', `
  SELECT pc.categoria, COUNT(DISTINCT p.id) n
  FROM productos p LEFT JOIN productos_catalogo pc ON pc.ef = p.fuente_inhrr_ef
  GROUP BY pc.categoria ORDER BY 2 DESC`)

await q('Con fuente INHRR vs sin', `
  SELECT CASE WHEN fuente_inhrr_ef IS NOT NULL THEN 'con_fuente' ELSE 'sin_fuente' END src, COUNT(*) FROM productos GROUP BY 1`)

await q('disponible / precio estado', `
  SELECT disponible, CASE WHEN precio_usd IS NOT NULL THEN 'con_precio' ELSE 'sin_precio' END, COUNT(*) FROM productos GROUP BY 1,2 ORDER BY 1,2`)

await client.end()
await client.end?.()