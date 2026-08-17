import { Router } from 'express';
import { 
  getEstadoCuenta, 
  getResumenClientes,
  getComparativaMensual,
  getElegibilidadAmpliacion,
  solicitarAmpliacion
} from '../controllers/estadocuenta.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

// Solo admin ve el resumen de todos los clientes
router.get('/estado-cuenta', verifyJWT, verifyAdmin, getResumenClientes);

// Admin ve cualquier cliente, usuario normal solo se ve a sí mismo
router.get('/:id/estado-cuenta', verifyJWT, getEstadoCuenta);

// Ruta para comparativa mensual
router.get('/:id/estado-cuenta/comparativa', verifyJWT, getComparativaMensual);

router.get('/:id/estado-cuenta/ampliacion-elegibilidad', verifyJWT, getElegibilidadAmpliacion);

router.post('/:id/estado-cuenta/ampliacion-solicitar', verifyJWT, solicitarAmpliacion);

export default router;