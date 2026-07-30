import { Router } from 'express';
import { login, register, verify } from '../controllers/auth.controller.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.get('/verify', verifyJWT, verify);

export default router;