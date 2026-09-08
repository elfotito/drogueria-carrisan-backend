import { Router } from 'express';
import {
  getPreciosStaff,
  actualizarPrecioStaff,
  actualizarPreciosLoteStaff,
} from '../controllers/staff.precios.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_COMERCIAL = ['vendedor', 'administrador', 'director', 'admin'];

router.get('/', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), getPreciosStaff);
router.patch('/lote', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), actualizarPreciosLoteStaff);
router.patch('/:id', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), actualizarPrecioStaff);

export default router;