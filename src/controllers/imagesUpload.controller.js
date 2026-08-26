import sharp from 'sharp';
import { supabase } from '../config/supabase.js';

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;
const BUCKET = 'crsnimages';

export async function subirImagen(req, res) {
  const archivo = req.file;

  if (!archivo) {
    return res.status(400).json({ error: 'No se recibió ningún archivo' });
  }
  if (!TIPOS_PERMITIDOS.includes(archivo.mimetype)) {
    return res.status(400).json({ error: 'Formato no permitido. Usa JPG, PNG, WEBP, GIF o AVIF.' });
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return res.status(400).json({ error: 'El archivo supera el tamaño máximo de 10MB' });
  }

  try {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const isGif = archivo.mimetype === 'image/gif';

    let buffer;
    let extension;

    if (isGif) {
      buffer = archivo.buffer;
      extension = 'gif';
    } else {
      buffer = await sharp(archivo.buffer)
        .resize({ width: 800, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      extension = 'webp';
    }

    const nombreArchivo = `uploads/${timestamp}-${random}.${extension}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(nombreArchivo, buffer, {
        contentType: isGif ? 'image/gif' : 'image/webp',
        upsert: false,
      });

    if (error) {
      console.error('Error al subir imagen a Supabase Storage:', error);
      return res.status(500).json({ error: 'No se pudo subir la imagen. Intenta de nuevo.' });
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(nombreArchivo);

    res.status(201).json({ url: urlData.publicUrl });
  } catch (err) {
    console.error('Error al procesar imagen:', err);
    res.status(500).json({ error: 'No se pudo procesar la imagen. Intenta de nuevo.' });
  }
}
