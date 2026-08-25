import { Router } from 'express';
import { verifyJWT } from '../middleware/auth.js';
import {
  getValoraciones,
  getMiValoracion,
  crearValoracion,
} from '../controllers/valoraciones.controller.js';

const router = Router();

router.get('/:id/valoraciones', getValoraciones); // pública
router.get('/:id/valoraciones/mia', verifyJWT, getMiValoracion);
router.post('/:id/valoraciones', verifyJWT, crearValoracion);

export default router;
