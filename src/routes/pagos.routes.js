import { Router } from 'express';
import { getPagos, createPago, deletePago } from '../controllers/pagos.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.use(verifyJWT, verifyAdmin);

router.get('/', getPagos);
router.post('/', createPago);
router.delete('/:id', deletePago);

export default router;