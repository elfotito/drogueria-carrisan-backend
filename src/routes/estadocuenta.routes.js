import { Router } from 'express';
import { getEstadoCuenta, getResumenClientes } from '../controllers/estadocuenta.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

// Solo admin ve el resumen de todos los clientes
router.get('/estado-cuenta', verifyJWT, verifyAdmin, getResumenClientes);

// Admin ve cualquier cliente, usuario normal solo se ve a sí mismo
router.get('/:id/estado-cuenta', verifyJWT, getEstadoCuenta);

router.get('/:id/estado-cuenta/comparativa', verifyJWT, getComparativaMensual);

export default router;