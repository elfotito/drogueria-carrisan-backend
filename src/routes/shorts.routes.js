import { Router } from 'express';
import { getShorts } from '../controllers/shorts.controller.js';

const router = Router();

router.get('/', getShorts);

export default router;