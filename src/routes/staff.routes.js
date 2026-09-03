import { Router } from 'express';
import { loginStaff, getColaDespacho, marcarEntregado, crearOrdenParaCliente, crearBridgeAdmin, buscarClientes, getDireccionesDeCliente } from '../controllers/staff.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_DESPACHO = ['despachador', 'administrador', 'admin'];
const ROLES_VENTAS = ['vendedor', 'administrador', 'admin'];
const ROLES_ADMIN = ['administrador', 'admin'];

router.post('/login', loginStaff);
router.get('/despacho', verifyStaffJWT, checkRolStaff(ROLES_DESPACHO), getColaDespacho);
router.patch('/despacho/:id/entregar', verifyStaffJWT, checkRolStaff(ROLES_DESPACHO), marcarEntregado);
router.get('/clientes', verifyStaffJWT, checkRolStaff(ROLES_VENTAS), buscarClientes);
router.get('/clientes/:id/direcciones', verifyStaffJWT, checkRolStaff(ROLES_VENTAS), getDireccionesDeCliente);
router.post('/ordenes', verifyStaffJWT, checkRolStaff(ROLES_VENTAS), crearOrdenParaCliente);
router.post('/admin-bridge', verifyStaffJWT, checkRolStaff(ROLES_ADMIN), crearBridgeAdmin);

export default router;