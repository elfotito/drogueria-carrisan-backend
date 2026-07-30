import { Router } from 'express';
import { getMarcas, createMarca } from '../controllers/marcas.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', getMarcas);
router.post('/', verifyJWT, verifyAdmin, createMarca);

export default router;