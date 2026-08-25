import { Router } from 'express';
import { getPublicKey, suscribir, desuscribir } from '../controllers/push.controller.js';
import { verifyJWT } from '../middleware/auth.js';
import { pushLimiter } from '../middleware/Ratelimit.js';

const router = Router();

router.get('/public-key', getPublicKey);
router.post('/subscribe', pushLimiter, verifyJWT, suscribir);
router.delete('/subscribe', pushLimiter, verifyJWT, desuscribir);

export default router;