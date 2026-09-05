import { Router } from 'express';
import {
  getColaRevisar,
  getColaPreparar,
  aprobarOrden,
  cancelarOrden,
  marcarEnviado,
  marcarListoParaRetiro,
} from '../controllers/almacen.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

// Almacenista maneja la revisión y preparación: administrador/director/admin también pueden.
const ROLES_ALMACEN = ['almacenista', 'administrador', 'director', 'admin'];

router.get('/revisar', verifyStaffJWT, checkRolStaff(ROLES_ALMACEN), getColaRevisar);
router.get('/preparar', verifyStaffJWT, checkRolStaff(ROLES_ALMACEN), getColaPreparar);
router.patch('/:id/aprobar', verifyStaffJWT, checkRolStaff(ROLES_ALMACEN), aprobarOrden);
router.patch('/:id/cancelar', verifyStaffJWT, checkRolStaff(ROLES_ALMACEN), cancelarOrden);
router.patch('/:id/enviado', verifyStaffJWT, checkRolStaff(ROLES_ALMACEN), marcarEnviado);
router.patch('/:id/listo-para-retiro', verifyStaffJWT, checkRolStaff(ROLES_ALMACEN), marcarListoParaRetiro);

export default router;