// Agregar en productos.routes.js, junto a las demás:

import {
  getValoraciones,
  getMiValoracion,
  crearValoracion,
} from '../controllers/valoraciones.controller.js';

router.get('/:id/valoraciones', getValoraciones); // pública
router.get('/:id/valoraciones/mia', verifyJWT, getMiValoracion);
router.post('/:id/valoraciones', verifyJWT, crearValoracion);
