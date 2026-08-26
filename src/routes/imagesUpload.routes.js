import { Router } from 'express';
import multer from 'multer';
import { subirImagen } from '../controllers/imagesUpload.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.post('/upload', verifyJWT, verifyAdmin, upload.single('imagen'), subirImagen);

export default router;
