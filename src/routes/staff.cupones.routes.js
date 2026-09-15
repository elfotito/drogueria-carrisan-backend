import { Router } from 'express';
import {
  generarCupones,
  listarCupones,
  getEstadisticas,
  eliminarCupon,
} from '../controllers/cupones.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();
// Solo roles de gestión (igual que Promociones y Precios).
const ROLES_GESTION = ['administrador', 'director', 'admin'];

router.use(verifyStaffJWT, checkRolStaff(ROLES_GESTION));

router.get('/estadisticas', getEstadisticas);
router.get('/', listarCupones);
router.post('/', generarCupones);
router.delete('/:id', eliminarCupon);

export default router;