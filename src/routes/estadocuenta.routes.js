import { Router } from 'express';
import { getEstadoCuenta, getResumenClientes } from '../controllers/estadocuenta.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.use(verifyJWT, verifyAdmin);

router.get('/', getResumenClientes);
router.get('/:id', getEstadoCuenta);

export default router;