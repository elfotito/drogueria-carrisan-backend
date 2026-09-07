import { Router } from 'express';
import {
  getPlantillas,
  crearPlantilla,
  actualizarPlantilla,
  eliminarPlantilla,
  getHistorial,
} from '../controllers/promociones.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_COMERCIAL = ['vendedor', 'administrador', 'director', 'admin'];

// Sin envío masivo (send/send-custom) — queda SOLO en /admin para el dueño.
router.get('/templates', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), getPlantillas);
router.post('/templates', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), crearPlantilla);
router.put('/templates/:id', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), actualizarPlantilla);
router.delete('/templates/:id', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), eliminarPlantilla);
router.get('/history', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), getHistorial);

export default router;