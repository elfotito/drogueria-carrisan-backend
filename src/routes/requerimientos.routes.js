import { Router } from 'express';
import {
  crearRequerimiento,
  getRequerimientos,
  getMisRequerimientos,
  responderRequerimiento,
} from '../controllers/requerimientos.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.post('/', verifyJWT, crearRequerimiento);
router.get('/', verifyJWT, verifyAdmin, getRequerimientos);
router.get('/mios', verifyJWT, getMisRequerimientos);
router.patch('/:id/responder', verifyJWT, verifyAdmin, responderRequerimiento);

export default router;