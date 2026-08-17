import { Router } from 'express';
import multer from 'multer';
import { subirComprobante } from '../controllers/uploads.controller.js';
import { verifyJWT } from '../middleware/auth.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB, doble chequeo (multer + controller)
});

const router = Router();

router.post('/comprobante', verifyJWT, upload.single('archivo'), subirComprobante);

export default router;