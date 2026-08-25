import { Router } from 'express';
import { getPublicKey, suscribir, desuscribir } from '../controllers/push.controller.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

router.get('/public-key', getPublicKey);
router.post('/subscribe', verifyJWT, suscribir);
router.delete('/subscribe', verifyJWT, desuscribir);

export default router;