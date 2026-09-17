import { Router } from 'express';
import {
  getStatus,
  getConfig,
  actualizarConfig,
} from '../controllers/registroInvita.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

// Pública: la página /registro/invita consulta si su token es válido.
router.get('/status', getStatus);

// Solo admin (panel Gestión de códigos de la Droguería).
router.get('/config', verifyJWT, verifyAdmin, getConfig);
router.post('/config', verifyJWT, verifyAdmin, actualizarConfig);

export default router;