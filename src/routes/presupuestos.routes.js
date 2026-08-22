import { Router } from 'express';
import {
  crearPresupuesto,
  getMisPresupuestos,
  getPresupuestoById,
  recotizarPresupuesto,
} from '../controllers/presupuestos.controller.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

router.post('/', verifyJWT, crearPresupuesto);
router.get('/mios', verifyJWT, getMisPresupuestos);
router.get('/:id', verifyJWT, getPresupuestoById);
router.post('/:id/recotizar', verifyJWT, recotizarPresupuesto);

export default router;