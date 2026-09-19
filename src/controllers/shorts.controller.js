import axios from 'axios';
import { YOUTUBE_CHANNEL_ID } from '../config/youtube.js';

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_VIDEOS = 12;

let cache = { videos: null, timestamp: 0 };

function parsearVideos(xml) {
  const entradas = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entradas.slice(0, MAX_VIDEOS).map((raw) => {
    const id = raw.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/)?.[1];
    const titulo = raw.match(/<media:title>([^<]*)<\/media:title>/)?.[1];
    const thumb = raw.match(/<media:thumbnail[^>]*url="([^"]+)"/)?.[1];
    if (!id) return null;
    return {
      id,
      titulo: (titulo || '').trim(),
      thumb: thumb || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${id}`,
    };
  }).filter(Boolean);
}

export async function getShorts(req, res) {
  if (!YOUTUBE_CHANNEL_ID) {
    return res.json({ videos: [], configurado: false });
  }

  const ahora = Date.now();
  if (cache.videos && ahora - cache.timestamp < CACHE_TTL_MS) {
    return res.json({ videos: cache.videos, configurado: true });
  }

  try {
    const { data } = await axios.get(FEED_URL, {
      params: { channel_id: YOUTUBE_CHANNEL_ID },
      timeout: 8000,
    });
    const videos = parsearVideos(data);
    cache = { videos, timestamp: ahora };
    return res.json({ videos, configurado: true });
  } catch {
    if (cache.videos) {
      return res.json({ videos: cache.videos, configurado: true });
    }
    return res.status(502).json({ error: 'No se pudo obtener el feed de YouTube', videos: [] });
  }
}