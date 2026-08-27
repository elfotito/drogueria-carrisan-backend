import { supabase } from '../config/supabase.js';

// ---------------------------------------------------------------
// Bucket público (mismo modelo de confianza que se tenía con Drive:
// "cualquiera con el link" — solo que ahora el link es una URL de
// Supabase Storage con nombre no adivinable, en vez de un fileId de
// Google). Debe existir y estar marcado como público en el panel de
// Supabase (Storage → crsndocs → Public bucket).
// ---------------------------------------------------------------
const BUCKET = 'crsndocs';

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const TAMANO_MAXIMO_BYTES = 2 * 1024 * 1024; // 2 MB

// POST /uploads/comprobante (cliente, multipart/form-data, campo "archivo")
export async function subirComprobante(req, res) {
  const archivo = req.file;

  if (!archivo) {
    return res.status(400).json({ error: 'No se recibió ningún archivo' });
  }
  if (!TIPOS_PERMITIDOS.includes(archivo.mimetype)) {
    return res.status(400).json({ error: 'Formato no permitido. Usa JPG, PNG, WEBP o PDF.' });
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return res.status(400).json({ error: 'El archivo supera el tamaño máximo de 2MB' });
  }

  try {
    const usuario_id = req.user.id;
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = archivo.originalname.split('.').pop();
    const nombreArchivo = `comprobantes/u${usuario_id}_${timestamp}-${random}.${extension}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(nombreArchivo, archivo.buffer, {
        contentType: archivo.mimetype,
        upsert: false,
      });

    if (error) {
      console.error('Error al subir comprobante a Supabase Storage:', error);
      return res.status(500).json({ error: 'No se pudo subir el comprobante. Intenta de nuevo.' });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(nombreArchivo);

    res.status(201).json({ url: urlData.publicUrl });
  } catch (err) {
    console.error('Error al subir comprobante:', err);
    res.status(500).json({ error: 'No se pudo subir el comprobante. Intenta de nuevo.' });
  }
}

const TIPOS_PERMITIDOS_REGISTRO = ['application/pdf'];

// POST /uploads/registro (público, multipart/form-data, campo "archivo")
// Sin verifyJWT: durante el registro el usuario todavía no tiene cuenta
// ni token. Protegido por rate limiting general de /uploads + validación
// estricta de tipo/tamaño. Los archivos quedan "sueltos" en el bucket
// hasta que el registro se completa y sus URLs se asocian al user_id
// recién creado (ver auth.controller.js → register). Si alguien sube un
// archivo y abandona el formulario, queda huérfano en el bucket —
// aceptable, se puede limpiar manualmente si se acumulan (igual que
// pasaba antes con Drive).
export async function subirArchivoRegistro(req, res) {
  const archivo = req.file;
  const { tipo_documento } = req.body; // rif | permiso_sanitario | registro_mercantil | certificado_acreditacion (solo para nombrar el archivo)

  if (!archivo) {
    return res.status(400).json({ error: 'No se recibió ningún archivo' });
  }
  if (!TIPOS_PERMITIDOS_REGISTRO.includes(archivo.mimetype)) {
    return res.status(400).json({ error: 'Formato no permitido. Solo se aceptan PDF.' });
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return res.status(400).json({ error: 'El archivo supera el tamaño máximo de 2MB' });
  }

  try {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const etiquetaDocumento = tipo_documento || 'documento';
    const nombreArchivo = `registro/${etiquetaDocumento}_${timestamp}-${random}.pdf`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(nombreArchivo, archivo.buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (error) {
      console.error('Error al subir archivo de registro a Supabase Storage:', error);
      return res.status(500).json({ error: 'No se pudo subir el archivo. Intenta de nuevo.' });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(nombreArchivo);

    res.status(201).json({ url: urlData.publicUrl });
  } catch (err) {
    console.error('Error al subir archivo de registro:', err);
    res.status(500).json({ error: 'No se pudo subir el archivo. Intenta de nuevo.' });
  }
}