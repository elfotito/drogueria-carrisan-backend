import pg from 'pg';
import fs from 'fs';
import { parsearDescripcion, matchScore, construirIndice, candidatosPara } from './lib/cobecaParser.mjs';
import { config } from 'dotenv';
config();

async function main() {
  const client = new pg.Client({
    host: process.env.SUPABASE_DB_HOST,
    port: process.env.SUPABASE_DB_PORT || 5432,
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER,
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows: productos } = await client.query(
    `SELECT id, nombre_comercial, molecula, forma, laboratorio, activo FROM public.productos ORDER BY id`
  );
  const byId = new Map(productos.map(p => [String(p.id), p]));

  // 1) Activo? de los perdidos de la muestra
  const muestra = [38194, 37418, 37654, 37921, 37508, 38286, 38284, 39205, 37350, 38463, 38535, 38534, 38926, 38918, 37588, 39430, 37460, 37456, 37326, 37687, 37896, 38994, 37778, 38305, 38448, 37454, 37452, 37825, 37998, 37999];
  console.log('=== ACTIVO de la muestra ===');
  for (const id of muestra) {
    const p = byId.get(String(id));
    console.log(`${id} | activo=${p?.activo} | ${p?.nombre_comercial}`);
  }

  // 2) Trace de la desc LOSARTAN/HTC exacta como la corre el loop real
  const desc = 'LOSARTAN/HTC COMP REC 50/12,5MGX60BLUE/M';
  const idx = construirIndice(productos.filter(p => p.activo));
  const parsed = parsearDescripcion(desc);
  parsed._raw = desc;
  const candidatos = candidatosPara(parsed, idx);
  const scorings = candidatos.map(p => ({ id: p.id, score: matchScore(parsed, p), nombre: p.nombre_comercial }));
  scorings.sort((a, b) => b.score - a.score);
  console.log(`\n=== TRACE desc="${desc}" (${candidatos.length} candidatos) ===`);
  for (const s of scorings.slice(0, 10)) {
    console.log(`${s.score.toFixed(3)} | ${s.id} | ${s.nombre}`);
  }
  console.log(`38194 en candidatos? ${candidatos.some(p => p.id === 38194)}, matchScore directo: ${matchScore(parsed, byId.get('38194')).toFixed(3)}`);

  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });