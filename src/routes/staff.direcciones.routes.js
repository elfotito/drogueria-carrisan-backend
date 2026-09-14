import { Router } from 'express';
import { getDireccionesDeCliente } from '../controllers/staff.controller.js';
import { getDireccionesStaff, updateDireccionStaff } from '../controllers/staff.direcciones.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

// El despachador (motorizado) NO accede a direcciones — su única ventana es /staff/envios.
const ROLES_LOGISTICA = ['almacenista', 'administrador', 'director', 'admin'];

router.get('/', verifyStaffJWT, checkRolStaff(ROLES_LOGISTICA), getDireccionesStaff);
router.get('/cliente/:id', verifyStaffJWT, checkRolStaff(ROLES_LOGISTICA), getDireccionesDeCliente);
router.patch('/:id', verifyStaffJWT, checkRolStaff(ROLES_LOGISTICA), updateDireccionStaff);

export default router;
