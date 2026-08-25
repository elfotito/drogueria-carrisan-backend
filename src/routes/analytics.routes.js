import { Router } from 'express';
import { getVentasPorPeriodo } from '../controllers/analytics.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/ventas', verifyJWT, verifyAdmin, getVentasPorPeriodo);

export default router;