import { Router } from 'express';
import multer from 'multer';
import { subirComprobante, subirArchivoRegistro } from '../controllers/Uploads.controller.js';
import { verifyJWT } from '../middleware/auth.js';
import { uploadsRegistroLimiter } from '../middleware/Ratelimit.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB, doble chequeo (multer + controller)
});

const router = Router();

router.post('/comprobante', verifyJWT, upload.single('archivo'), subirComprobante);

// Público (sin verifyJWT): se usa durante el registro, antes de que
// exista la cuenta. Rate limit propio y más estricto que el general de
// la API — ver comentario en Ratelimit.js. Ver también el controller
// para el detalle del flujo y por qué es seguro dejarlo sin auth.
router.post('/registro', uploadsRegistroLimiter, upload.single('archivo'), subirArchivoRegistro);

export default router;