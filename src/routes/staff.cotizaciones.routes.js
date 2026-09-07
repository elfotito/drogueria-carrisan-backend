import { Router } from 'express';
import {
  getCotizaciones,
  responderCotizacion,
  rechazarCotizacion,
} from '../controllers/cotizaciones.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_COMERCIAL = ['vendedor', 'administrador', 'director', 'admin'];

router.get('/', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), getCotizaciones);
router.patch('/:id/responder', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), responderCotizacion);
router.patch('/:id/rechazar', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), rechazarCotizacion);

export default router;