import axios from 'axios';
import { YOUTUBE_CHANNEL_IDS } from '../config/youtube.js';

const PAGE_URL = 'https://www.youtube.com/channel';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_VIDEOS = 24;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const RE_ID = /^[\w-]{11}$/;

let cache = { videos: null, timestamp: 0 };

function tituloDesde(titleObj) {
  if (typeof titleObj === 'string') return titleObj;
  if (Array.isArray(titleObj?.runs)) {
    return titleObj.runs.map((r) => (typeof r?.text === 'string' ? r.text : '')).join('');
  }
  return '';
}

function videoDesdeLockup(lockup) {
  const id = lockup.contentId;
  if (typeof id !== 'string' || !RE_ID.test(id)) return null;

  const titulo = tituloDesde(lockup.metadata?.lockupMetadataViewModel?.title?.content).trim();
  const fuente = lockup.contentImage?.thumbnailViewModel?.image?.sources?.at(-1)?.url;

  return {
    id,
    titulo,
    thumb: typeof fuente === 'string' ? fuente.split('?')[0] : `https://i.ytimg.com/vi/${id}/hq720.jpg`,
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

function videoDesdeShorts(shorts) {
  const reel = shorts?.onTap?.innertubeCommand?.reelWatchEndpoint;
  const id = reel?.videoId
    || (typeof shorts?.entityId === 'string' ? shorts.entityId.replace(/^shorts-shelf-item-/, '') : null);
  if (typeof id !== 'string' || !RE_ID.test(id)) return null;

  let titulo = tituloDesde(shorts?.overlayMetadata?.primaryText?.content).trim();
  if (!titulo && typeof shorts?.accessibilityText === 'string') {
    titulo = shorts.accessibilityText.split(',')[0].trim();
  }
  const fuente = reel?.thumbnail?.thumbnails?.at(-1)?.url
    || shorts?.thumbnailViewModel?.image?.sources?.at(-1)?.url;

  return {
    id,
    titulo,
    thumb: typeof fuente === 'string' ? fuente.split('?')[0] : `https://i.ytimg.com/vi/${id}/frame0.jpg`,
    url: `https://www.youtube.com/shorts/${id}`,
  };
}

export function parsearPagina(html) {
  const data = extraerYtInitialData(html);
  if (!data) return [];

  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  const candidatos = [
    tabs.find((t) => t?.tabRenderer?.title === 'Shorts'),
    tabs.find((t) => t?.tabRenderer?.title === 'Videos'),
    tabs.find((t) => t?.tabRenderer?.selected),
    tabs[0],
  ].filter(Boolean);

  const videos = [];
  for (const tab of candidatos) {
    const contents = tab.tabRenderer?.content?.richGridRenderer?.contents || [];
    for (const item of contents) {
      const contenido = item?.richItemRenderer?.content;
      const shorts = contenido?.shortsLockupViewModel;
      const lockup = contenido?.lockupViewModel;
      const video = shorts ? videoDesdeShorts(shorts) : lockup ? videoDesdeLockup(lockup) : null;
      if (video && !videos.some((v) => v.id === video.id)) videos.push(video);
    }
    if (videos.length > 0) break;
  }
  return videos;
}

function extraerYtInitialData(html) {
  const marcadores = ['window["ytInitialData"] = ', 'var ytInitialData = '];
  for (const marcador of marcadores) {
    const inicio = html.indexOf(marcador);
    if (inicio === -1) continue;
    const cuerpo = html.slice(inicio + marcador.length);
    let profundidad = 0;
    let enString = false;
    let escapado = false;
    for (let i = 0; i < cuerpo.length; i++) {
      const c = cuerpo[i];
      if (enString) {
        if (escapado) escapado = false;
        else if (c === '\\') escapado = true;
        else if (c === '"') enString = false;
        continue;
      }
      if (c === '"') { enString = true; continue; }
      if (c === '{') profundidad++;
      else if (c === '}') {
        profundidad--;
        if (profundidad === 0) {
          try {
            return JSON.parse(cuerpo.slice(0, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

export async function getShorts(req, res) {
  if (YOUTUBE_CHANNEL_IDS.length === 0) {
    return res.json({ videos: [], configurado: false });
  }

  const ahora = Date.now();
  if (cache.videos && ahora - cache.timestamp < CACHE_TTL_MS) {
    return res.json({ videos: cache.videos, configurado: true });
  }

  const resultados = await Promise.allSettled(
    YOUTUBE_CHANNEL_IDS.map((canal) => axios.get(`${PAGE_URL}/${canal}/shorts`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'es' },
      timeout: 15000,
    }))
  );

  const videos = [];
  for (const r of resultados) {
    if (r.status === 'rejected') {
      console.error('shorts: fallo al obtener el canal', r.reason?.message);
      continue;
    }
    const vids = parsearPagina(r.value.data);
    for (const v of vids) {
      if (!videos.some((x) => x.id === v.id)) videos.push(v);
    }
  }

  if (videos.length === 0) {
    if (cache.videos) return res.json({ videos: cache.videos, configurado: true });
    return res.status(502).json({ error: 'No se pudo obtener los shorts de YouTube', videos: [] });
  }

  cache = { videos: videos.slice(0, MAX_VIDEOS), timestamp: ahora };
  return res.json({ videos: cache.videos, configurado: true });
}