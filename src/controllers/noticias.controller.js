import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Feed de noticias farmacéuticas (Diariofarma) ──────────────────
// Si en el futuro se agregan más fuentes, basta con sumar su URL acá
// y concatenar sus items en getNoticias — el parseo no cambia por fuente.
const FUENTES_RSS = [
  'https://diariofarma.com/feed/',
];

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas
const MAX_NOTICIAS = 12;

let cache = { data: null, timestamp: 0 };

// Extrae la primera imagen disponible de un <item>: primero busca
// media:content/enclosure (poco común en WordPress sin plugin), y si no
// hay, cae a la primera <img> dentro de content:encoded o description.
function extraerImagen($item) {
  const media = $item.find('media\\:content, enclosure').first().attr('url');
  if (media) return media;

  const contenidoHtml = $item.find('content\\:encoded').first().text()
    || $item.find('description').first().text();
  const match = contenidoHtml.match(/<img[^>]+src="([^">]+)"/i);
  return match ? match[1] : null;
}

// El <description> de WordPress trae HTML — lo limpiamos a texto plano
// y lo recortamos a un resumen corto para el teaser/listado.
function limpiarResumen(html) {
  if (!html) return '';
  const texto = cheerio.load(`<div>${html}</div>`)('div').text();
  return texto.trim().replace(/\s+/g, ' ').slice(0, 180);
}

async function obtenerNoticiasDeFuente(url) {
  const { data: xml } = await axios.get(url, {
    timeout: 10000,
    headers: { 'User-Agent': 'DrogueriaCarrisanBot/1.0 (+https://drogueriacarrisan.com)' },
  });

  const $ = cheerio.load(xml, { xmlMode: true });
  const noticias = [];

  $('item').each((_, el) => {
    const $item = $(el);
    const titulo = $item.find('title').first().text().trim();
    const link = $item.find('link').first().text().trim();
    if (!titulo || !link) return; // item mal formado, se descarta

    noticias.push({
      titulo,
      resumen: limpiarResumen($item.find('description').first().text()),
      link,
      imagen: extraerImagen($item),
      fecha: $item.find('pubDate').first().text().trim() || null,
      fuente: 'Diariofarma',
    });
  });

  return noticias;
}

// GET /noticias
export async function getNoticias(req, res) {
  const ahora = Date.now();

  if (cache.data && (ahora - cache.timestamp) < CACHE_TTL_MS) {
    return res.json(cache.data);
  }

  try {
    const resultadosPorFuente = await Promise.all(
      FUENTES_RSS.map((url) => obtenerNoticiasDeFuente(url).catch((err) => {
        console.error(`Error al leer feed ${url}:`, err.message);
        return [];
      }))
    );

    const noticias = resultadosPorFuente
      .flat()
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, MAX_NOTICIAS);

    // Si todas las fuentes fallaron y no hay nada nuevo que mostrar,
    // preferimos servir la cache vieja (si existe) antes que una lista vacía.
    if (noticias.length === 0 && cache.data) {
      return res.json(cache.data);
    }

    cache = { data: noticias, timestamp: ahora };
    res.json(noticias);
  } catch (err) {
    console.error('Error al obtener noticias:', err.message);
    if (cache.data) return res.json(cache.data);
    res.status(500).json({ error: 'No se pudieron obtener las noticias' });
  }
}