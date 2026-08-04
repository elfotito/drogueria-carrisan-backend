const supabase = require('../config/supabase') // ajusta la ruta a tu cliente de Supabase

// ===================================================================
// Helpers de negocio (exportados para usarlos en productosController)
// ===================================================================

/**
 * Trae todos los descuentos actualmente vigentes:
 * activo = true, fecha_inicio <= now, fecha_fin >= now o NULL
 */
async function getDescuentosVigentes() {
  const ahora = new Date().toISOString()

  const { data, error } = await supabase
    .from('descuentos')
    .select('*')
    .eq('activo', true)
    .lte('fecha_inicio', ahora)
    .or(`fecha_fin.is.null,fecha_fin.gte.${ahora}`)

  if (error) throw error
  return data
}

/**
 * ¿Este descuento aplica a este producto?
 */
function descuentoAplica(descuento, producto) {
  switch (descuento.alcance) {
    case 'producto':
      return descuento.producto_id === producto.id
    case 'marca':
      return descuento.marca_id === producto.marca_id
    case 'laboratorio':
      return descuento.alcance_valor === producto.laboratorio
    case 'molecula':
      return descuento.alcance_valor === producto.molecula
    case 'linea':
      return descuento.alcance_valor === producto.linea
    case 'forma':
      return descuento.alcance_valor === producto.forma
    default:
      return false
  }
}

/**
 * Convierte un descuento a monto real en USD para un precio base dado
 */
function calcularDescuentoUSD(descuento, precioBase) {
  if (descuento.tipo === 'porcentaje') {
    return precioBase * (Number(descuento.valor) / 100)
  }
  return Number(descuento.valor) // monto fijo
}

/**
 * Dado un producto y la lista de descuentos vigentes (ya cargados de una vez
 * para no golpear la DB por cada producto), devuelve el producto enriquecido
 * con precio_usd (final), precio_original_usd y descuento_activo.
 *
 * Regla: si varios descuentos aplican, gana el que dé MAYOR ahorro en USD.
 */
function resolverPrecioProducto(producto, descuentosVigentes) {
  if (producto.precio_usd == null) {
    return { ...producto, precio_original_usd: null, descuento_activo: null }
  }

  const aplicables = descuentosVigentes.filter(d => descuentoAplica(d, producto))

  if (aplicables.length === 0) {
    return { ...producto, precio_original_usd: null, descuento_activo: null }
  }

  const mejor = aplicables.reduce((max, d) => {
    const montoD = calcularDescuentoUSD(d, producto.precio_usd)
    const montoMax = calcularDescuentoUSD(max, producto.precio_usd)
    return montoD > montoMax ? d : max
  })

  const montoDescuento = calcularDescuentoUSD(mejor, producto.precio_usd)
  const precioFinal = Math.max(0, producto.precio_usd - montoDescuento)

  return {
    ...producto,
    precio_original_usd: producto.precio_usd,
    precio_usd: Number(precioFinal.toFixed(2)),
    descuento_activo: {
      id: mejor.id,
      tipo: mejor.tipo,
      valor: Number(mejor.valor),
      alcance: mejor.alcance,
      fecha_fin: mejor.fecha_fin,
    },
  }
}

/**
 * Aplica descuentos a un array de productos en un solo paso.
 * Úsalo en getProductos (listado).
 */
async function aplicarDescuentosAProductos(productos) {
  const vigentes = await getDescuentosVigentes()
  return productos.map(p => resolverPrecioProducto(p, vigentes))
}

/**
 * Aplica descuentos a un solo producto.
 * Úsalo en getProductoById (detalle).
 */
async function aplicarDescuentoAProducto(producto) {
  const vigentes = await getDescuentosVigentes()
  return resolverPrecioProducto(producto, vigentes)
}

// ===================================================================
// Endpoints CRUD (admin)
// ===================================================================

// GET /descuentos  — listado completo para el panel admin, con datos del producto/marca si aplica
async function listarDescuentos(req, res) {
  try {
    const { data, error } = await supabase
      .from('descuentos')
      .select(`
        *,
        productos:producto_id ( id, nombre_comercial ),
        marcas:marca_id ( id, nombre )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    const ahora = new Date()
    const conEstado = data.map(d => ({
      ...d,
      estado: calcularEstadoDescuento(d, ahora),
    }))

    res.json(conEstado)
  } catch (err) {
    console.error('Error listando descuentos:', err)
    res.status(500).json({ error: 'Error al listar descuentos' })
  }
}

// GET /descuentos/producto/:id — historial de descuentos de un producto puntual
// (solo alcance='producto'; si quieres incluir los de marca/laboratorio que también
// le apliquen, dímelo y lo extendemos)
async function historialPorProducto(req, res) {
  try {
    const { id } = req.params
    const { data, error } = await supabase
      .from('descuentos')
      .select('*')
      .eq('producto_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('Error obteniendo historial:', err)
    res.status(500).json({ error: 'Error al obtener historial de descuentos' })
  }
}

// POST /descuentos — crear
async function crearDescuento(req, res) {
  try {
    const {
      alcance,
      producto_id,
      marca_id,
      alcance_valor,
      tipo,
      valor,
      fecha_inicio,
      fecha_fin,
      activo,
    } = req.body

    const errorValidacion = validarPayloadDescuento(req.body)
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion })
    }

    const payload = {
      alcance,
      tipo,
      valor,
      fecha_inicio: fecha_inicio || new Date().toISOString(),
      fecha_fin: fecha_fin || null,
      activo: activo !== undefined ? activo : true,
      producto_id: alcance === 'producto' ? producto_id : null,
      marca_id: alcance === 'marca' ? marca_id : null,
      alcance_valor: ['laboratorio', 'molecula', 'linea', 'forma'].includes(alcance)
        ? alcance_valor
        : null,
    }

    const { data, error } = await supabase
      .from('descuentos')
      .insert(payload)
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    console.error('Error creando descuento:', err)
    res.status(500).json({ error: 'Error al crear descuento' })
  }
}

// PUT /descuentos/:id — editar
async function editarDescuento(req, res) {
  try {
    const { id } = req.params
    const {
      alcance,
      producto_id,
      marca_id,
      alcance_valor,
      tipo,
      valor,
      fecha_inicio,
      fecha_fin,
      activo,
    } = req.body

    const errorValidacion = validarPayloadDescuento(req.body)
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion })
    }

    const payload = {
      alcance,
      tipo,
      valor,
      fecha_inicio,
      fecha_fin: fecha_fin || null,
      activo,
      producto_id: alcance === 'producto' ? producto_id : null,
      marca_id: alcance === 'marca' ? marca_id : null,
      alcance_valor: ['laboratorio', 'molecula', 'linea', 'forma'].includes(alcance)
        ? alcance_valor
        : null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('descuentos')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('Error editando descuento:', err)
    res.status(500).json({ error: 'Error al editar descuento' })
  }
}

// DELETE /descuentos/:id
async function eliminarDescuento(req, res) {
  try {
    const { id } = req.params
    const { error } = await supabase.from('descuentos').delete().eq('id', id)
    if (error) throw error
    res.json({ mensaje: 'Descuento eliminado' })
  } catch (err) {
    console.error('Error eliminando descuento:', err)
    res.status(500).json({ error: 'Error al eliminar descuento' })
  }
}

// ===================================================================
// Helpers internos
// ===================================================================

function validarPayloadDescuento(body) {
  const { alcance, producto_id, marca_id, alcance_valor, tipo, valor } = body

  const alcancesValidos = ['producto', 'marca', 'laboratorio', 'molecula', 'linea', 'forma']
  if (!alcancesValidos.includes(alcance)) {
    return `alcance inválido, debe ser uno de: ${alcancesValidos.join(', ')}`
  }

  if (!['porcentaje', 'monto'].includes(tipo)) {
    return "tipo inválido, debe ser 'porcentaje' o 'monto'"
  }

  if (valor == null || Number(valor) <= 0) {
    return 'valor debe ser un número mayor a 0'
  }

  if (tipo === 'porcentaje' && Number(valor) > 100) {
    return 'un descuento porcentual no puede ser mayor a 100'
  }

  if (alcance === 'producto' && !producto_id) {
    return 'producto_id es requerido cuando alcance = producto'
  }

  if (alcance === 'marca' && !marca_id) {
    return 'marca_id es requerido cuando alcance = marca'
  }

  if (['laboratorio', 'molecula', 'linea', 'forma'].includes(alcance) && !alcance_valor) {
    return 'alcance_valor es requerido para ese tipo de alcance'
  }

  return null
}

function calcularEstadoDescuento(descuento, ahora) {
  if (!descuento.activo) return 'inactivo'
  const inicio = new Date(descuento.fecha_inicio)
  const fin = descuento.fecha_fin ? new Date(descuento.fecha_fin) : null

  if (inicio > ahora) return 'programado'
  if (fin && fin < ahora) return 'expirado'
  return 'vigente'
}

module.exports = {
  // endpoints
  listarDescuentos,
  historialPorProducto,
  crearDescuento,
  editarDescuento,
  eliminarDescuento,
  // helpers para usar en productosController
  getDescuentosVigentes,
  aplicarDescuentosAProductos,
  aplicarDescuentoAProducto,
  resolverPrecioProducto,
}
