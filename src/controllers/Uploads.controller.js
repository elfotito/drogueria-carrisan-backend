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

// Carpeta separada para documentos de registro (RIF, permiso sanitario,
// registro mercantil, certificado profesional). Si no se define, caen
// en la raíz del mismo Drive que los comprobantes de pago.
const FOLDER_ID_REGISTRO = process.env.GOOGLE_DRIVE_FOLDER_ID_REGISTRO || FOLDER_ID;

const TIPOS_PERMITIDOS_REGISTRO = ['application/pdf'];

// POST /uploads/registro (público, multipart/form-data, campo "archivo")
// Sin verifyJWT: durante el registro el usuario todavía no tiene cuenta
// ni token. Protegido por rate limiting general de /uploads + validación
// estricta de tipo/tamaño. Los archivos quedan "sueltos" en Drive hasta
// que el registro se completa y sus URLs se asocian al user_id recién
// creado (ver auth.controller.js → register). Si alguien sube un archivo
// y abandona el formulario, queda huérfano en Drive — aceptable, se
// puede limpiar manualmente si se acumulan.
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
    return res.status(400).json({ error: 'El archivo supera el tamaño máximo de 10MB' });
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const etiquetaDocumento = tipo_documento || 'documento';
    const nombreArchivo = `registro_${etiquetaDocumento}_${timestamp}.pdf`;

    const { data } = await drive.files.create({
      requestBody: {
        name: nombreArchivo,
        parents: FOLDER_ID_REGISTRO ? [FOLDER_ID_REGISTRO] : undefined,
      },
      media: {
        mimeType: archivo.mimetype,
        body: Readable.from(archivo.buffer),
      },
      fields: 'id, webViewLink',
    });

    // Privado por defecto en Drive; le damos acceso de lector a
    // cualquiera con el link para que el admin lo abra directo desde
    // el panel de verificación de cuentas.
    await drive.permissions.create({
      fileId: data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    res.status(201).json({
      url: data.webViewLink,
      drive_file_id: data.id,
    });
  } catch (err) {
    console.error('Error al subir archivo de registro a Drive:', err);
    res.status(500).json({ error: 'No se pudo subir el archivo. Intenta de nuevo.' });
  }
}