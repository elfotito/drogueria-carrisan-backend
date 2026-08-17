import { google } from 'googleapis';
import { Readable } from 'stream';

// ---------------------------------------------------------------
// Cliente OAuth2 autenticado como tesoreria.dcarrisan@gmail.com.
// Usa un refresh_token generado UNA VEZ localmente (ver
// obtener-refresh-token.js) — nunca vence, Google emite access_tokens
// nuevos automáticamente con esta librería.
// ---------------------------------------------------------------
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_DRIVE_CLIENT_ID,
  process.env.GOOGLE_DRIVE_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// Carpeta de Drive donde se guardan los comprobantes. Opcional: si no
// se define, los archivos se suben a la raíz del Drive de la cuenta.
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || null;

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB

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
    return res.status(400).json({ error: 'El archivo supera el tamaño máximo de 10MB' });
  }

  try {
    const usuario_id = req.user.id;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = archivo.originalname.split('.').pop();
    const nombreArchivo = `comprobante_u${usuario_id}_${timestamp}.${extension}`;

    const { data } = await drive.files.create({
      requestBody: {
        name: nombreArchivo,
        parents: FOLDER_ID ? [FOLDER_ID] : undefined,
      },
      media: {
        mimeType: archivo.mimetype,
        body: Readable.from(archivo.buffer),
      },
      fields: 'id, webViewLink',
    });

    // El archivo se sube privado por defecto. Le damos acceso de "lector"
    // a cualquiera con el link para que el admin pueda abrirlo directo
    // desde el panel sin tener que loguearse con tesoreria.dcarrisan.
    await drive.permissions.create({
      fileId: data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    res.status(201).json({
      url: data.webViewLink,
      drive_file_id: data.id,
    });
  } catch (err) {
    console.error('Error al subir comprobante a Drive:', err);
    res.status(500).json({ error: 'No se pudo subir el comprobante. Intenta de nuevo.' });
  }
}