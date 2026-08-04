const express = require('express')
const router = express.Router()
const {
  listarDescuentos,
  historialPorProducto,
  crearDescuento,
  editarDescuento,
  eliminarDescuento,
} = require('../controllers/descuentos.controller')
const verifyJWT = require('../middleware/verifyJWT') // ajusta el nombre/ruta real
const soloAdmin = require('../middleware/soloAdmin')  // si ya tienes un middleware de rol admin

// Todas protegidas: solo admin gestiona descuentos
router.get('/', verifyJWT, soloAdmin, listarDescuentos)
router.get('/producto/:id', verifyJWT, soloAdmin, historialPorProducto)
router.post('/', verifyJWT, soloAdmin, crearDescuento)
router.put('/:id', verifyJWT, soloAdmin, editarDescuento)
router.delete('/:id', verifyJWT, soloAdmin, eliminarDescuento)

module.exports = router
