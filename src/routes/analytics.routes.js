import { Router } from 'express';
import { getVentasPorPeriodo, getEstadoCuentaClientes, getTopProductos } from '../controllers/analytics.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/ventas', verifyJWT, verifyAdmin, getVentasPorPeriodo);
router.get('/clientes', verifyJWT, verifyAdmin, getEstadoCuentaClientes);
router.get('/productos', verifyJWT, verifyAdmin, getTopProductos);

export default router;