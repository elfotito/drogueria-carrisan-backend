import { Router } from 'express';
import {
  getFacturas,
  createFactura,
  updateFactura,
  deleteFactura,
  getOrdenesSinFacturar
} from '../controllers/facturas.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.use(verifyJWT, verifyAdmin);

router.get('/', getFacturas);
router.post('/', createFactura);
router.patch('/:id', updateFactura);
router.delete('/:id', deleteFactura);
router.get('/sin-facturar/:usuario_id', getOrdenesSinFacturar);

export default router;