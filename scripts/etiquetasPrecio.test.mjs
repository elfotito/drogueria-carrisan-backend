// scripts/etiquetasPrecio.test.mjs
// Tests de las funciones puras de precio por etiqueta (descuentos.controller.js).
// Uso: node --test scripts/etiquetasPrecio.test.mjs
import 'dotenv/config'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  precioConEtiqueta,
  resolverPrecioCliente,
} from '../src/controllers/descuentos.controller.js'

test('precioConEtiqueta: descuento positivo reduce el precio', () => {
  assert.equal(precioConEtiqueta(10, 2), 9.8)
  assert.equal(precioConEtiqueta(50, 8), 46)
})

test('precioConEtiqueta: redondea a 2 decimales', () => {
  assert.equal(precioConEtiqueta(33.33, 2), 32.66)
  assert.equal(precioConEtiqueta(0.1, 8), 0.09)
})

test('precioConEtiqueta: porcentaje negativo es recargo', () => {
  assert.equal(precioConEtiqueta(10, -5), 10.5)
})

test('precioConEtiqueta: sin porcentaje deja el precio intacto', () => {
  assert.equal(precioConEtiqueta(10, 0), 10)
  assert.equal(precioConEtiqueta(10, undefined), 10)
  assert.equal(precioConEtiqueta(10, null), 10)
})

test('precioConEtiqueta: precio base nulo devuelve null', () => {
  assert.equal(precioConEtiqueta(null, 2), null)
  assert.equal(precioConEtiqueta(undefined, 2), null)
})

test('resolverPrecioCliente: sin promo, etiqueta es silenciosa y ajusta precio', () => {
  const prod = { id: 1, precio_usd: 10, marca_id: 1, laboratorio: 'X' }
  const res = resolverPrecioCliente(prod, 2, [])
  assert.equal(res.precio_usd, 9.8)
  assert.equal(res.precio_original_usd, null)
  assert.equal(res.descuento_activo, null)
})

test('resolverPrecioCliente: con promo, el tachado es el precio con etiqueta', () => {
  const promo = {
    id: 99, alcance: 'producto', producto_id: 1, marca_id: null,
    alcance_valor: null, tipo: 'porcentaje', valor: 50, fecha_fin: null,
  }
  const prod = { id: 1, precio_usd: 10, marca_id: 1, laboratorio: 'X' }
  // etiqueta 2% → 9.8; promo 50% → 4.9 vs base tachado 9.8
  const res = resolverPrecioCliente(prod, 2, [promo])
  assert.equal(res.precio_original_usd, 9.8)
  assert.equal(res.precio_usd, 4.9)
  assert.equal(res.descuento_activo.id, 99)
})

test('resolverPrecioCliente: etiqueta 0% equivale al resuelto de tienda', () => {
  const promo = {
    id: 99, alcance: 'producto', producto_id: 1, marca_id: null,
    alcance_valor: null, tipo: 'porcentaje', valor: 50, fecha_fin: null,
  }
  const prod = { id: 1, precio_usd: 10, marca_id: 1, laboratorio: 'X' }
  const res = resolverPrecioCliente(prod, 0, [promo])
  assert.equal(res.precio_original_usd, 10)
  assert.equal(res.precio_usd, 5)
})

test('resolverPrecioCliente: producto sin precio conserva estado consulta', () => {
  const prod = { id: 2, precio_usd: null }
  const res = resolverPrecioCliente(prod, 8, [])
  assert.equal(res.precio_original_usd, null)
  assert.equal(res.descuento_activo, null)
  assert.equal(res.precio_usd, null)
})

test('resolverPrecioCliente: gana la promo de mayor ahorro sobre el precio con etiqueta', () => {
  const promo1 = {
    id: 1, alcance: 'producto', producto_id: 1, marca_id: null,
    alcance_valor: null, tipo: 'porcentaje', valor: 10, fecha_fin: null,
  }
  const promo2 = {
    id: 2, alcance: 'producto', producto_id: 1, marca_id: null,
    alcance_valor: null, tipo: 'monto', valor: 3, fecha_fin: null,
  }
  const prod = { id: 1, precio_usd: 10, marca_id: 1, laboratorio: 'X' }
  // etiqueta 8% → 9.2; 10% → 0.92; monto 3 → gana el monto → 6.2
  const res = resolverPrecioCliente(prod, 8, [promo1, promo2])
  assert.equal(res.precio_usd, 6.2)
  assert.equal(res.descuento_activo.id, 2)
})