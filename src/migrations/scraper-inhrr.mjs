/**
 * Scraper INHRR - Versión final corregida
 * Usa el formato reqQuery que es el que acepta el servidor
 */

import axios from 'axios';
import fs from 'fs';

// Tus cookies de Firefox (actualízalas si expiran)
const FIREFOX_COOKIES = '__Host-authjs.csrf-token=b688830228c2b6073332b06ff68c79736d1a4db47a91e9db7a95cdd5c4ea0640%7C08571a2f040aa492f2eeb0bb8a6141496c8bc0446a2d305ee2e60540bff25e08; __Secure-authjs.callback-url=https%3A%2F%2Finhrr.gob.ve';

const BASE = 'https://inhrr.gob.ve/sismed';
const OUTPUT_JSON = 'productos_inhrr.json';
const OUTPUT_CSV = 'productos_inhrr.csv';

// Headers EXACTOS que usa Firefox
const FIREFOX_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
  'Accept-Encoding': 'gzip, deflate, br',
  'Origin': 'https://inhrr.gob.ve',
  'Connection': 'keep-alive',
  'Referer': 'https://inhrr.gob.ve/sismed/productos-farma',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'TE': 'trailers',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Función para hacer la búsqueda con el formato correcto
async function buscarProductos(cookie, take, query = '', intentos = 3) {
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      console.log(`  Buscando productos (take=${take}, intento ${intento}/${intentos})...`);
      
      const body = {
        reqQuery: {
          general: query,
          take: take
        }
      };
      
      const res = await axios.post(
        `${BASE}/api/productos-farma`,
        body,
        {
          headers: {
            ...FIREFOX_HEADERS,
            'Content-Type': 'application/json',
            'Cookie': cookie,
          },
          timeout: 120000, // 2 minutos para respuestas grandes
          validateStatus: () => true,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );
      
      if (res.status === 200 && res.data?.success === true) {
        const count = res.data.combinedData?.length || 0;
        console.log(`  ✓ Éxito: ${count} productos recibidos`);
        return res.data;
      }
      
      console.warn(`  Respuesta inesperada:`, res.data);
      throw new Error('El servidor rechazó la solicitud');
      
    } catch (e) {
      const esUltimoIntento = intento === intentos;
      const info = e.response ? `HTTP ${e.response.status}` : e.message;
      
      if (esUltimoIntento) {
        throw new Error(`Falló la búsqueda (take=${take}): ${info}`);
      }
      
      console.warn(`  Reintentando en ${intento * 5} segundos...`);
      await sleep(5000 * intento);
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
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  }
  return lines.join('\n');
}

async function main() {
  console.log('=== INHRR Scraper - Versión Final ===\n');
  
  const cookie = FIREFOX_COOKIES;
  
  // 1. Obtener el total de productos
  console.log('1. Obteniendo total de productos...');
  const probe = await buscarProductos(cookie, 10);
  const total = probe.countTotal || 22706;
  console.log(`   Total de productos reportado: ${total}\n`);
  
  // 2. Intentar obtener todos los productos de una vez
  console.log(`2. Intentando obtener todos los ${total} productos de una vez...`);
  console.log('   (Esto puede tardar varios minutos, ten paciencia)');
  
  let productos = [];
  let data = null;
  
  try {
    data = await buscarProductos(cookie, total + 100, '', 1);
    productos = data.combinedData || [];
    console.log(`   Obtenidos: ${productos.length} / ${total} productos\n`);
  } catch (e) {
    console.warn(`   No se pudo obtener todo de una vez: ${e.message}`);
    console.log('   Intentando en bloques más pequeños...\n');
  }
  
  // 3. Si no se obtuvieron todos, intentar en bloques
  if (productos.length < total) {
    console.log('3. Obteniendo productos en bloques...');
    
    // Estrategia: aumentar gradualmente el take
    const bloques = [100, 500, 1000, 2000, 5000, 10000, 20000, total + 100];
    
    for (const take of bloques) {
      if (take > total + 100) break;
      
      console.log(`   Intentando con take=${take}...`);
      try {
        data = await buscarProductos(cookie, take, '', 2);
        productos = data.combinedData || [];
        
        console.log(`   Obtenidos: ${productos.length} / ${total} productos`);
        
        if (productos.length >= total) {
          console.log('   ✓ ¡Productos completos obtenidos!');
          break;
        }
      } catch (e) {
        console.warn(`   Error con take=${take}: ${e.message}`);
      }
      
      await sleep(2000); // Esperar entre intentos
    }
  }
  
  // 4. Si aún faltan productos, intentar con búsquedas por letra
  if (productos.length < total) {
    console.log('\n4. Buscando productos por letra inicial...');
    
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const productosUnicos = new Map();
    
    // Agregar productos ya obtenidos
    for (const p of productos) {
      if (p.id) productosUnicos.set(p.id, p);
    }
    
    for (const letra of letras) {
      console.log(`   Buscando productos que empiezan con "${letra}"...`);
      
      try {
        const dataLetra = await buscarProductos(cookie, 5000, letra, 2);
        const productosLetra = dataLetra.combinedData || [];
        
        for (const p of productosLetra) {
          if (p.id) productosUnicos.set(p.id, p);
        }
        
        console.log(`   Total acumulado: ${productosUnicos.size} / ${total}`);
        
        if (productosUnicos.size >= total) {
          console.log('   ✓ ¡Productos completos obtenidos!');
          break;
        }
      } catch (e) {
        console.warn(`   Error con letra ${letra}: ${e.message}`);
      }
      
      await sleep(1000);
    }
    
    productos = Array.from(productosUnicos.values());
  }
  
  // 5. Guardar resultados
  console.log('\n5. Guardando resultados...');
  
  if (productos.length === 0) {
    console.error('No se obtuvieron productos. Abortando.');
    return;
  }
  
  // Guardar JSON
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(productos, null, 2), 'utf8');
  console.log(`   -> ${OUTPUT_JSON} guardado (${productos.length} productos)`);
  
  // Guardar CSV
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
  console.log(`   -> ${OUTPUT_CSV} guardado`);
  
  // Resumen final
  console.log('\n=== Resumen Final ===');
  console.log(`Total esperado: ${total}`);
  console.log(`Total obtenido: ${productos.length}`);
  console.log(`Completado: ${((productos.length / total) * 100).toFixed(2)}%`);
  
  if (productos.length < total) {
    console.log('\n⚠️  No se obtuvieron todos los productos.');
    console.log('Sugerencias:');
    console.log('1. Actualiza las cookies en el script');
    console.log('2. Usa una VPN con IP venezolana');
    console.log('3. Intenta en diferentes horarios');
  } else {
    console.log('\n✓ ¡Scraping completado exitosamente!');
  }
}

main().catch((e) => {
  console.error('Error fatal:', e.message);
  process.exitCode = 1;
});