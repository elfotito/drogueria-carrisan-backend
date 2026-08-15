import { Router } from 'express';
import {
  createOrden,
  getOrdenes,
  getOrdenById,
  getOrdenesPendientesPago,
  updateEstadoOrden
} from '../controllers/ordenes.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.post('/', verifyJWT, createOrden);
router.get('/', verifyJWT, getOrdenes);
// Debe ir ANTES de '/:id' — si no, Express interpreta 'pendientes-pago' como un :id.
router.get('/pendientes-pago', verifyJWT, getOrdenesPendientesPago);
router.get('/:id', verifyJWT, getOrdenById);
router.patch('/:id/estado', verifyJWT, verifyAdmin, updateEstadoOrden);

export default router;