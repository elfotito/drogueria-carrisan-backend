import { Router } from 'express';
import { getVentasPorPeriodo } from '../controllers/analytics.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';
import { getVentasPorPeriodo, getEstadoCuentaClientes } from '../controllers/analytics.controller.js';

const router = Router();

router.get('/ventas', verifyJWT, verifyAdmin, getVentasPorPeriodo);
router.get('/clientes', verifyJWT, verifyAdmin, getEstadoCuentaClientes);

export default router;