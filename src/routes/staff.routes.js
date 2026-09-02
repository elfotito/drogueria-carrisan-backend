import { Router } from 'express';
import { loginStaff, getColaDespacho, marcarEntregado, crearOrdenParaCliente } from '../controllers/staff.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_DESPACHO = ['despachador', 'administrador', 'admin'];
const ROLES_VENTAS = ['vendedor', 'administrador', 'admin'];

router.post('/login', loginStaff);
router.get('/despacho', verifyStaffJWT, checkRolStaff(ROLES_DESPACHO), getColaDespacho);
router.patch('/despacho/:id/entregar', verifyStaffJWT, checkRolStaff(ROLES_DESPACHO), marcarEntregado);
router.post('/ordenes', verifyStaffJWT, checkRolStaff(ROLES_VENTAS), crearOrdenParaCliente);

export default router;