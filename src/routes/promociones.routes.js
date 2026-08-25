import { Router } from 'express';
import {
  getPlantillas,
  crearPlantilla,
  actualizarPlantilla,
  eliminarPlantilla,
  enviarPromocion,
  enviarPromocionCustom,
  getHistorial,
} from '../controllers/promociones.controller.js';
import { verifyJWT } from '../middleware/auth.js';
import { soloAdmin } from '../middleware/soloAdmin.middleware.js';

const router = Router();

router.get('/templates', verifyJWT, soloAdmin, getPlantillas);
router.post('/templates', verifyJWT, soloAdmin, crearPlantilla);
router.put('/templates/:id', verifyJWT, soloAdmin, actualizarPlantilla);
router.delete('/templates/:id', verifyJWT, soloAdmin, eliminarPlantilla);
router.post('/send/:id', verifyJWT, soloAdmin, enviarPromocion);
router.post('/send-custom', verifyJWT, soloAdmin, enviarPromocionCustom);
router.get('/history', verifyJWT, soloAdmin, getHistorial);

export default router;
