import { Router } from 'express';
import { suscribir, desuscribir } from '../controllers/push.controller.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

router.post('/suscribir', verifyJWT, suscribir);
router.post('/desuscribir', verifyJWT, desuscribir);

export default router;