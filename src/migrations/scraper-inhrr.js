/**
 * Descarga el catálogo completo de productos farmacéuticos del INHRR
 * (Venezuela) usando su API interna de búsqueda, en vez de adivinar
 * números de registro uno por uno.
 *
 * Endpoint real (descubierto inspeccionando el Network tab del navegador):
 *   POST https://inhrr.gob.ve/sismed/api/productos-farma
 *   body: { ...filtros vacíos..., take: N }
 *   -> { success, message, combinedData: [...], countTotal }
 *
 * "Cargar más" en la web NO pagina con skip/offset -- simplemente vuelve
 * a pedir todo con un `take` más grande. Por eso acá pedimos directo con
 * take = countTotal (con margen), y si el servidor lo limita, caemos a
 * pedir en bloques crecientes hasta alcanzar el total.
 *
 * Uso: node scraper-inhrr.js
 * Requiere: npm install axios   (si no lo tienes ya en el proyecto)
 */

import axios from 'axios';
import fs from 'fs';

const BASE = 'https://inhrr.gob.ve/sismed';
const OUTPUT_JSON = 'productos_inhrr.json';
const OUTPUT_CSV = 'productos_inhrr.csv';

const HEADERS_BASE = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.9',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseCookies(setCookieHeaders) {
  if (!setCookieHeaders) return '';
  return setCookieHeaders.map((c) => c.split(';')[0]).join('; ');
}

// Visita el endpoint de sesión de NextAuth (visto en el Network tab del
// navegador: /sismed/api/auth/session) para conseguir la cookie que la
// API de búsqueda espera ver en el POST.
async function obtenerCookies() {
  const res = await axios.get(`${BASE}/api/auth/session`, {
    headers: HEADERS_BASE,
    validateStatus: () => true,
  });
  const cookie = parseCookies(res.headers['set-cookie']);
  console.log(`  cookie obtenida: ${cookie ? cookie.slice(0, 60) + '...' : '(vacía -- el sitio no devolvió Set-Cookie aquí)'}`);
  return cookie;
}

function bodyBusqueda(take) {
  return {
    desdeFechaAprobado: '',
    equalPA: '',
    fabricante: '',
    farmaceuticoPatrocinante: '',
    general: '',
    hastaFechaAprobado: '',
    nombreProd: '',
    numeroRegistro: '',
    principioActivo: '',
    representante: '',
    take,
  };
}

async function buscarProductos(cookie, take, intentos = 3) {
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      const res = await axios.post(`${BASE}/api/productos-farma`, bodyBusqueda(take), {
        headers: {
          ...HEADERS_BASE,
          'Content-Type': 'application/json',
          Referer: `${BASE}/productos-farma`,
          Cookie: cookie,
        },
        timeout: 60000,
        validateStatus: () => true, // manejamos nosotros los códigos de error, para poder inspeccionarlos
      });

      const contentType = res.headers['content-type'] || '';
      const esJson = contentType.includes('application/json');
      const cuerpoComoTexto = esJson ? JSON.stringify(res.data) : String(res.data);

      if (res.status !== 200 || !esJson || res.data?.success !== true) {
        console.warn(
          `  aviso: respuesta inesperada (take=${take}) -> HTTP ${res.status}, content-type "${contentType}"\n` +
            `  primeros 300 caracteres: ${cuerpoComoTexto.slice(0, 300)}`
        );
        throw new Error(`respuesta inesperada, HTTP ${res.status}`);
      }

      return res.data; // { success, message, combinedData, countTotal }
    } catch (e) {
      const esUltimoIntento = intento === intentos;
      const info = e.response ? `HTTP ${e.response.status}` : e.message;
      if (esUltimoIntento) throw new Error(`Falló la búsqueda (take=${take}) tras ${intentos} intentos: ${info}`);
      console.warn(`  reintentando (intento ${intento} falló: ${info})...`);
      await sleep(2000 * intento);
    }
  }
}

// --- CSV helpers ---
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows, headers) {
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  return lines.join('\n');
}

async function main() {
  console.log('Obteniendo cookie de sesión...');
  const cookie = await obtenerCookies();

  console.log('Consultando el total real de productos...');
  const probe = await buscarProductos(cookie, 1);
  const total = probe.countTotal;
  console.log(`countTotal reportado por el sitio: ${total}`);

  console.log(`Pidiendo los ${total} productos en una sola llamada (puede tardar, es una respuesta grande)...`);
  let data = await buscarProductos(cookie, total + 100);
  let productos = data.combinedData || [];
  console.log(`Recibidos: ${productos.length} / ${total}`);

  // Fallback: si el servidor limita el take y no trajo todo, subimos
  // en bloques hasta alcanzar el total (cada vez pide desde cero, así
  // que solo nos quedamos con la última respuesta, la más completa).
  let take = productos.length;
  const PASO = 2000;
  while (productos.length < total && take < total + PASO) {
    take += PASO;
    console.log(`  no llegó completo, reintentando con take=${take}...`);
    data = await buscarProductos(cookie, take);
    productos = data.combinedData || [];
    console.log(`  ahora: ${productos.length} / ${total}`);
    await sleep(500);
  }

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(productos, null, 2), 'utf8');
  console.log(`-> ${OUTPUT_JSON} guardado (${productos.length} productos)`);

  const headers = [
    'ef',
    'id',
    'nombre',
    'principioActivo',
    'dci',
    'concentracion',
    'formaFarmaceutica',
    'viaDeAdministracion',
    'tipoVenta',
    'representante',
    'rifRepresentante',
    'patrocinante',
    'fabricante',
    'fechaAprobado',
    'fechaVigencia',
    'fechaCancelado',
  ];
  fs.writeFileSync(OUTPUT_CSV, toCsv(productos, headers), 'utf8');
  console.log(`-> ${OUTPUT_CSV} guardado`);

  if (productos.length < total) {
    console.warn(
      `\nAviso: solo se obtuvieron ${productos.length} de ${total} reportados. El servidor puede tener un límite de "take" más bajo -- revisar manualmente.`
    );
  }
}

main().catch((e) => {
  console.error('Error fatal:', e.message);
  process.exitCode = 1;
});
