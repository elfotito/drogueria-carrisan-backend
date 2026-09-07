import { Router } from 'express';
import { getDireccionesDeCliente } from '../controllers/staff.controller.js';
import { getDireccionesStaff } from '../controllers/staff.direcciones.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_LOGISTICA = ['despachador', 'administrador', 'director', 'admin'];

router.get('/', verifyStaffJWT, checkRolStaff(ROLES_LOGISTICA), getDireccionesStaff);
router.get('/cliente/:id', verifyStaffJWT, checkRolStaff(ROLES_LOGISTICA), getDireccionesDeCliente);

export default router;