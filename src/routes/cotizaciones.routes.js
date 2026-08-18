import { Router } from 'express';
import {
  crearSolicitud,
  getCotizaciones,
  getMisCotizaciones,
  responderCotizacion,
  rechazarCotizacion,
} from '../controllers/cotizaciones.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.post('/', verifyJWT, crearSolicitud);
router.get('/', verifyJWT, verifyAdmin, getCotizaciones);
router.get('/mias', verifyJWT, getMisCotizaciones);
router.patch('/:id/responder', verifyJWT, verifyAdmin, responderCotizacion);
router.patch('/:id/rechazar', verifyJWT, verifyAdmin, rechazarCotizacion);

export default router;