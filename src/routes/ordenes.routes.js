import { Router } from 'express';
import {
  createOrden,
  getOrdenes,
  getOrdenById,
  updateEstadoOrden
} from '../controllers/ordenes.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.post('/', verifyJWT, createOrden);
router.get('/', verifyJWT, getOrdenes);
router.get('/:id', verifyJWT, getOrdenById);
router.patch('/:id/estado', verifyJWT, verifyAdmin, updateEstadoOrden);

export default router;