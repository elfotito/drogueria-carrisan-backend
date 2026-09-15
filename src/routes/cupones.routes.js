import { Router } from 'express';
import { verificarCupon } from '../controllers/cupones.controller.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

router.post('/verificar', verifyJWT, verificarCupon);

export default router;