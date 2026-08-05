import { Router } from 'express';
import {
  getListas,
  createLista,
  updateLista,
  deleteLista,
  getListaItems,
  addItemToLista,
  removeItemFromLista
} from '../controllers/listas.controller.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

router.get('/', verifyJWT, getListas);
router.post('/', verifyJWT, createLista);
router.patch('/:id', verifyJWT, updateLista);
router.delete('/:id', verifyJWT, deleteLista);

router.get('/:id/items', verifyJWT, getListaItems);
router.post('/:id/items', verifyJWT, addItemToLista);
router.delete('/:id/items/:productoId', verifyJWT, removeItemFromLista);

export default router;