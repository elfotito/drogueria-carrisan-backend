// backend/src/routes/perfil.routes.js
import { Router } from 'express';
import { getPerfil, updateHorarioRecepcion } from '../controllers/perfil.controller.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(verifyJWT);

router.get('/', getPerfil);
router.patch('/horario', updateHorarioRecepcion);

export default router;