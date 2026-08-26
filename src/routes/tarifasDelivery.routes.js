import { Router } from 'express';
import {
  getTarifas,
  getTarifasActivas,
  crearTarifa,
  actualizarTarifa,
  eliminarTarifa,
} from '../controllers/tarifasDelivery.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

// Público (sin auth) — para que el frontend pueda calcular el costo en checkout
router.get('/activas', getTarifasActivas);

// Admin only
router.get('/', verifyJWT, verifyAdmin, getTarifas);
router.post('/', verifyJWT, verifyAdmin, crearTarifa);
router.put('/:id', verifyJWT, verifyAdmin, actualizarTarifa);
router.delete('/:id', verifyJWT, verifyAdmin, eliminarTarifa);

export default router;
