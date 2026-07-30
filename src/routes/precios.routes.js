import { Router } from 'express';
import { getTasaCambio, updateTasaCambio } from '../controllers/precios.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', getTasaCambio);
router.patch('/tasa-cambio', verifyJWT, verifyAdmin, updateTasaCambio);

export default router;