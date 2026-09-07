import { Router } from 'express';
import {
  loginStaff,
  registrarStaff,
  getColaDespacho,
  marcarEntregado,
  crearOrdenParaCliente,
  crearBridgeAdmin,
  buscarClientes,
  getDireccionesDeCliente,
  getPresupuestosDeCliente,
  crearPresupuestoParaCliente,
  getPresupuestoStaff,
  recotizarPresupuestoStaff,
  generarPedidoDesdePresupuesto,
} from '../controllers/staff.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_DESPACHO = ['despachador', 'administrador', 'director', 'admin'];
const ROLES_VENTAS = ['vendedor', 'administrador', 'director', 'admin'];
const ROLES_ADMIN = ['administrador', 'director', 'admin'];

router.post('/registro', registrarStaff);
router.post('/login', loginStaff);
router.get('/despacho', verifyStaffJWT, checkRolStaff(ROLES_DESPACHO), getColaDespacho);
router.patch('/despacho/:id/entregar', verifyStaffJWT, checkRolStaff(ROLES_DESPACHO), marcarEntregado);
router.get('/clientes', verifyStaffJWT, checkRolStaff(ROLES_VENTAS), buscarClientes);
router.get('/clientes/:id/direcciones', verifyStaffJWT, checkRolStaff(ROLES_VENTAS), getDireccionesDeCliente);
router.post('/ordenes', verifyStaffJWT, checkRolStaff(ROLES_VENTAS), crearOrdenParaCliente);
router.get('/clientes/:id/presupuestos', verifyStaffJWT, checkRolStaff(ROLES_VENTAS), getPresupuestosDeCliente);
router.post('/presupuestos', verifyStaffJWT, checkRolStaff(ROLES_VENTAS), crearPresupuestoParaCliente);
router.get('/presupuestos/:id', verifyStaffJWT, checkRolStaff(ROLES_VENTAS), getPresupuestoStaff);
router.post('/presupuestos/:id/recotizar', verifyStaffJWT, checkRolStaff(ROLES_VENTAS), recotizarPresupuestoStaff);
router.post('/presupuestos/:id/generar-pedido', verifyStaffJWT, checkRolStaff(ROLES_VENTAS), generarPedidoDesdePresupuesto);
router.post('/admin-bridge', verifyStaffJWT, checkRolStaff(ROLES_ADMIN), crearBridgeAdmin);

export default router;