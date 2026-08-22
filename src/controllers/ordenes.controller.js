import { supabase } from '../config/supabase.js';
import { crearNotificacion } from './notificaciones.controller.js';

// ---------------------------------------------------------
// Pipeline de estados de una orden. 'cancelado' es un estado
// terminal fuera de la línea normal (una orden puede cancelarse
// desde cualquier punto).
// ---------------------------------------------------------
const ESTADOS_VALIDOS = ['pedido_creado', 'procesando', 'preparando', 'enviado', 'entregado', 'cancelado'];

const LABELS_ESTADO = {
  pedido_creado: 'Pedido Creado',
  procesando: 'Procesando',
  preparando: 'Preparando',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};

// Transiciones permitidas entre estados
const TRANSICIONES_PERMITIDAS = {
  pedido_creado: ['procesando', 'cancelado'],
  procesando: ['preparando', 'cancelado'],
  preparando: ['enviado', 'cancelado'],
  enviado: ['entregado', 'cancelado'],
  entregado: [],
  cancelado: []
};

// Normaliza estados heredados
function normalizarEstado(estado) {
  const mapa = {
    pendiente: 'pedido_creado',
    confirmado: 'procesando',
    en_preparacion: 'preparando',
    finalizado: 'entregado'
  };
  return mapa[estado] || estado;
}

// Valida transición de estado
function validarTransicion(estadoActual, nuevoEstado) {
  const transicionesPermitidas = TRANSICIONES_PERMITIDAS[estadoActual];
  if (!transicionesPermitidas) return false;
  return transicionesPermitidas.includes(nuevoEstado);
}

// Calcula saldo de crédito
async function calcularSaldoCredito(usuario_id) {
  const { data: cliente, error: errorCliente } = await supabase
    .from('users')
    .select('linea_credito, dias_credito')
    .eq('id', usuario_id)
    .single();

  if (errorCliente || !cliente) {
    throw errorCliente || new Error('Usuario no encontrado');
  }

  const { data: facturas, error: errorFacturas } = await supabase
    .from('facturas')
    .select('monto_facturado')
    .eq('usuario_id', usuario_id);

  if (errorFacturas) throw errorFacturas;

  const { data: pagos, error: errorPagos } = await supabase
    .from('pagos')
    .select('monto')
    .eq('usuario_id', usuario_id);

  if (errorPagos) throw errorPagos;

  const total_facturado = facturas.reduce((sum, f) => sum + Number(f.monto_facturado), 0);
  const total_pagado = pagos.reduce((sum, p) => sum + Number(p.monto), 0);
  const deuda_actual = total_facturado - total_pagado;
  const saldo_disponible = Number(cliente.linea_credito) - deuda_actual;

  return {
    saldo_disponible,
    deuda_actual,
    dias_credito: cliente.dias_credito,
    linea_credito: cliente.linea_credito
  };
}

// Verifica órdenes vencidas
async function tieneOrdenesVencidas(usuario_id) {
  const { data: ordenesVencidas, error: errorVencidas } = await supabase
    .from('ordenes')
    .select('id')
    .eq('usuario_id', usuario_id)
    .neq('estado', 'cancelado')
    .neq('estado_pago', 'verificado')
    .not('fecha_vencimiento', 'is', null)
    .lt('fecha_vencimiento', new Date().toISOString());

  if (errorVencidas) throw errorVencidas;
  return ordenesVencidas && ordenesVencidas.length > 0;
}

// Valida items
function validarItems(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return 'Debe incluir al menos un item';
  }

  for (const item of items) {
    if (!item.producto_id) {
      return 'Cada item debe tener un producto_id';
    }
    if (!item.cantidad || item.cantidad <= 0) {
      return `Cantidad inválida para el producto ${item.producto_id}`;
    }
    if (!Number.isInteger(item.cantidad)) {
      return `La cantidad debe ser un número entero para el producto ${item.producto_id}`;
    }
  }

  return null;
}

// POST /orders
export async function createOrden(req, res) {
  const { items, forma_pago, sub_usuario_id, costo_envio_usd } = req.body;

  const usuario_id = (req.user.es_admin && req.body.usuario_id)
    ? req.body.usuario_id
    : req.user.id;

  const errorValidacion = validarItems(items);
  if (errorValidacion) {
    return res.status(400).json({ error: errorValidacion });
  }

  const envio = Number(costo_envio_usd) > 0 ? Number(costo_envio_usd) : 0;
  const formaPagoSolicitada = forma_pago === 'credito' ? 'credito' : 'contado';

  try {
    let subUsuarioValidado = null;
    if (sub_usuario_id) {
      const { data: subUsuario, error: errorSub } = await supabase
        .from('sub_usuarios')
        .select('id, usuario_id, activo')
        .eq('id', sub_usuario_id)
        .single();

      if (errorSub || !subUsuario || subUsuario.usuario_id !== usuario_id || !subUsuario.activo) {
        return res.status(400).json({ error: 'Sub-usuario inválido' });
      }
      subUsuarioValidado = subUsuario.id;
    }

    const productoIds = items.map(item => item.producto_id);
    const { data: productos, error: errorProductos } = await supabase
      .from('productos')
      .select('id, precio_usd, disponible')
      .in('id', productoIds);

    if (errorProductos) throw errorProductos;

    for (const item of items) {
      const producto = productos.find(p => p.id === item.producto_id);
      if (!producto) {
        return res.status(400).json({ error: `Producto ${item.producto_id} no existe` });
      }
      if (!producto.disponible) {
        return res.status(400).json({ error: `Producto ${item.producto_id} no disponible` });
      }
    }

    let total_usd = 0;
    const itemsConPrecio = items.map(item => {
      const producto = productos.find(p => p.id === item.producto_id);
      const subtotal = producto.precio_usd * item.cantidad;
      total_usd += subtotal;
      return {
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        precio_unitario: producto.precio_usd
      };
    });

    total_usd += envio;

    let forma_pago_final = 'contado';
    let fecha_vencimiento = null;

    if (formaPagoSolicitada === 'credito') {
      try {
        const tieneVencidas = await tieneOrdenesVencidas(usuario_id);
        
        if (tieneVencidas) {
          return res.status(403).json({
            error: 'Tenés órdenes vencidas pendientes de pago. Regularizá tu cuenta para seguir comprando a crédito.',
            codigo: 'CUENTA_CON_VENCIDAS',
          });
        }

        const creditoInfo = await calcularSaldoCredito(usuario_id);
        
        if (creditoInfo.saldo_disponible >= total_usd) {
          forma_pago_final = 'credito';
          
          if (creditoInfo.dias_credito) {
            const vencimiento = new Date();
            vencimiento.setDate(vencimiento.getDate() + Number(creditoInfo.dias_credito));
            fecha_vencimiento = vencimiento.toISOString();
          }
        }
      } catch (errorCredito) {
        console.error('Error al validar crédito:', errorCredito);
        forma_pago_final = 'contado';
        fecha_vencimiento = null;
      }
    }

    const { data: orden, error: errorOrden } = await supabase
      .from('ordenes')
      .insert({
        usuario_id,
        estado: 'pedido_creado',
        total_usd,
        forma_pago: forma_pago_final,
        fecha_vencimiento,
        sub_usuario_id: subUsuarioValidado
      })
      .select()
      .single();

    if (errorOrden) throw errorOrden;

    const itemsParaInsertar = itemsConPrecio.map(item => ({
      ...item,
      orden_id: orden.id
    }));

    const { error: errorItems } = await supabase
      .from('ordenes_items')
      .insert(itemsParaInsertar);

    if (errorItems) {
      await supabase.from('ordenes').delete().eq('id', orden.id);
      throw errorItems;
    }

    await supabase.from('ordenes_historial').insert({
      orden_id: orden.id,
      estado: 'pedido_creado'
    });

    const mensajeCreacion = forma_pago_final === 'credito'
      ? `Tu orden #${orden.id} por $${total_usd} fue recibida. Te avisaremos si hay algún ajuste en las cantidades.`
      : `Tu orden #${orden.id} por $${total_usd} fue recibida. Te avisaremos cuando esté lista para procesar el pago.`;

    await crearNotificacion(
      usuario_id,
      'orden_creada',
      'Orden creada',
      mensajeCreacion,
      orden.id
    );

    res.status(201).json({ ...orden, items: itemsConPrecio });
  } catch (err) {
    console.error('Error al crear orden:', err);
    
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflicto de datos' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Referencia inválida' });
    }
    
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /orders - CORREGIDO: Devuelve array directo para compatibilidad
export async function getOrdenes(req, res) {
  try {
    let query = supabase
      .from('ordenes')
      .select('*, users(id, nombre, email), ordenes_items(*, productos(nombre_comercial))')
      .order('created_at', { ascending: false });

    if (!req.user.es_admin) {
      query = query.eq('usuario_id', req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    // IMPORTANTE: Devolver array directamente
    // Asegurar que ordenes_items siempre sea un array
    const dataNormalizada = (data || []).map(orden => ({
      ...orden,
      ordenes_items: Array.isArray(orden.ordenes_items) ? orden.ordenes_items : []
    }));

    // Devolver array directo (formato que espera el frontend)
    res.json(dataNormalizada);
  } catch (err) {
    console.error('Error al obtener órdenes:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /orders/:id - CORREGIDO: Incluye historial y asegura arrays
export async function getOrdenById(req, res) {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('ordenes')
      .select('*, users(id, nombre, email), ordenes_items(*, productos(nombre_comercial))')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    if (!req.user.es_admin && data.usuario_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { data: historial, error: errorHistorial } = await supabase
      .from('ordenes_historial')
      .select('*')
      .eq('orden_id', id)
      .order('fecha', { ascending: true });

    if (errorHistorial) throw errorHistorial;

    const historialFinal = (historial && historial.length > 0)
      ? historial
      : [{ estado: normalizarEstado(data.estado), fecha: data.created_at }];

    // Asegurar que ordenes_items sea array
    const ordenNormalizada = {
      ...data,
      ordenes_items: Array.isArray(data.ordenes_items) ? data.ordenes_items : [],
      historial: historialFinal
    };

    res.json(ordenNormalizada);
  } catch (err) {
    console.error('Error al obtener orden:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// Mensajes de notificación
function mensajeParaTransicion(estado, forma_pago, ordenId) {
  if (estado === 'procesando') {
    if (forma_pago === 'contado') {
      return `¡Tu orden #${ordenId} está lista! Ya puedes proceder con el pago.`;
    }
    return null;
  }
  if (estado === 'enviado') {
    return `Tu orden #${ordenId} salió de nuestro almacén rumbo a destino.`;
  }
  if (estado === 'entregado') {
    return `Tu orden #${ordenId} fue entregada con éxito.`;
  }
  if (estado === 'cancelado') {
    return `Tu orden #${ordenId} fue cancelada.`;
  }
  return `Tu orden #${ordenId} cambió a: ${LABELS_ESTADO[estado] || estado}`;
}

// Aplica cambio de estado
async function aplicarCambioEstado(orden, estado) {
  const { data, error } = await supabase
    .from('ordenes')
    .update({ estado })
    .eq('id', orden.id)
    .select()
    .single();

  if (error || !data) {
    throw error || new Error('Orden no encontrada al actualizar estado');
  }

  await supabase.from('ordenes_historial').insert({
    orden_id: data.id,
    estado
  });

  const mensaje = mensajeParaTransicion(estado, data.forma_pago, data.id);
  if (mensaje) {
    await crearNotificacion(
      data.usuario_id,
      'estado_cambiado',
      'Estado actualizado',
      mensaje,
      data.id
    );
  }
if (estado === 'entregado' && data.forma_pago === 'credito' && !data.fecha_vencimiento) {
    const { data: cliente, error: errorCliente } = await supabase
      .from('users')
      .select('dias_credito')
      .eq('id', data.usuario_id)
      .single();

    if (!errorCliente && cliente?.dias_credito) {
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + cliente.dias_credito);

      const { data: actualizada, error: errorVenc } = await supabase
        .from('ordenes')
        .update({ fecha_vencimiento: fechaVencimiento.toISOString() })
        .eq('id', data.id)
        .select()
        .single();

      if (!errorVenc) data = actualizada;
    }
  }

  return data;
}

// GET /orders/pendientes-pago - CORREGIDO: Devuelve array directo
export async function getOrdenesPendientesPago(req, res) {
  const usuario_id = req.user.id;

  try {
    const { data, error } = await supabase
      .from('ordenes')
      .select('*, ordenes_items(*, productos(nombre_comercial))')
      .eq('usuario_id', usuario_id)
      .eq('forma_pago', 'contado')
      .eq('estado', 'procesando')
      .in('estado_pago', ['esperando', 'rechazado'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Normalizar para asegurar arrays
    const dataNormalizada = (data || []).map(orden => ({
      ...orden,
      ordenes_items: Array.isArray(orden.ordenes_items) ? orden.ordenes_items : []
    }));

    // Devolver array directo
    res.json(dataNormalizada);
  } catch (err) {
    console.error('Error al obtener órdenes pendientes de pago:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /orders/vencidas - Devuelve array directo
export async function getOrdenesVencidas(req, res) {
  const usuario_id = req.user.id;

  try {
    const { data, error } = await supabase
      .from('ordenes')
      .select('*, ordenes_items(*, productos(nombre_comercial))')
      .eq('usuario_id', usuario_id)
      .eq('forma_pago', 'credito')
      .neq('estado', 'cancelado')
      .neq('estado_pago', 'verificado')
      .not('fecha_vencimiento', 'is', null)
      .lt('fecha_vencimiento', new Date().toISOString())
      .order('fecha_vencimiento', { ascending: true });

    if (error) throw error;

    // Normalizar para asegurar arrays
    const dataNormalizada = (data || []).map(orden => ({
      ...orden,
      ordenes_items: Array.isArray(orden.ordenes_items) ? orden.ordenes_items : []
    }));

    res.json(dataNormalizada);
  } catch (err) {
    console.error('Error al obtener órdenes vencidas:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /orders/:id/estado
export async function updateEstadoOrden(req, res) {
  const { id } = req.params;
  const { estado } = req.body;

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  try {
    const { data: ordenActual, error: errorActual } = await supabase
      .from('ordenes')
      .select('*')
      .eq('id', id)
      .single();

    if (errorActual || !ordenActual) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    if (!req.user.es_admin) {
      return res.status(403).json({ error: 'No autorizado para cambiar estados' });
    }

    if (!validarTransicion(ordenActual.estado, estado)) {
      return res.status(400).json({
        error: `Transición inválida de ${ordenActual.estado} a ${estado}`,
        transiciones_permitidas: TRANSICIONES_PERMITIDAS[ordenActual.estado]
      });
    }

    let data = await aplicarCambioEstado(ordenActual, estado);

    if (estado === 'procesando') {
      if (data.forma_pago === 'credito') {
        data = await aplicarCambioEstado(data, 'preparando');
      } else {
        const { data: actualizada, error: errorPago } = await supabase
          .from('ordenes')
          .update({ estado_pago: 'esperando' })
          .eq('id', data.id)
          .select()
          .single();

        if (errorPago) throw errorPago;
        data = actualizada;
      }
    }

    if (estado === 'cancelado') {
      const { data: cancelada, error: errorCancelacion } = await supabase
        .from('ordenes')
        .update({ estado_pago: 'cancelado' })
        .eq('id', data.id)
        .select()
        .single();

      if (errorCancelacion) throw errorCancelacion;
      data = cancelada;
    }

    // Asegurar que la respuesta tenga la estructura correcta
    res.json({
      ...data,
      ordenes_items: Array.isArray(data.ordenes_items) ? data.ordenes_items : []
    });
  } catch (err) {
    console.error('Error al actualizar estado:', err);
    
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflicto de datos' });
    }
    
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /orders/:id/items - Admin ajusta cantidades o elimina productos
// de una orden ya creada (ej: falta de disponibilidad). Recalcula el
// total y notifica al cliente el detalle del ajuste.
export async function updateItemsOrden(req, res) {
  const { id } = req.params;
  const { items } = req.body; // [{ id: ordenes_items.id, cantidad }] — cantidad 0 = eliminar

  if (!req.user.es_admin) {
    return res.status(403).json({ error: 'No autorizado para modificar items de la orden' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un item' });
  }

  for (const item of items) {
    if (!item.id) {
      return res.status(400).json({ error: 'Cada item debe incluir su id' });
    }
    if (item.cantidad === undefined || item.cantidad === null || item.cantidad < 0 || !Number.isInteger(item.cantidad)) {
      return res.status(400).json({ error: `Cantidad inválida para el item ${item.id}` });
    }
  }

  try {
    const { data: ordenActual, error: errorActual } = await supabase
      .from('ordenes')
      .select('*, ordenes_items(*, productos(nombre_comercial))')
      .eq('id', id)
      .single();

    if (errorActual || !ordenActual) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    if (['entregado', 'cancelado'].includes(ordenActual.estado)) {
      return res.status(400).json({ error: `No se puede modificar una orden en estado ${LABELS_ESTADO[ordenActual.estado] || ordenActual.estado}` });
    }

    const itemsActuales = ordenActual.ordenes_items || [];
    const itemsPorId = new Map(itemsActuales.map(i => [i.id, i]));

    // Validar que todos los items pertenezcan a esta orden
    for (const item of items) {
      const itemActual = itemsPorId.get(item.id);
      if (!itemActual) {
        return res.status(400).json({ error: `El item ${item.id} no pertenece a esta orden` });
      }
      if (itemActual.cantidad === item.cantidad) continue;
      // Si se aumenta la cantidad, validar disponibilidad del producto
      if (item.cantidad > itemActual.cantidad) {
        const { data: producto, error: errorProducto } = await supabase
          .from('productos')
          .select('disponible')
          .eq('id', itemActual.producto_id)
          .single();
        if (errorProducto || !producto || !producto.disponible) {
          return res.status(400).json({ error: `El producto de item ${item.id} no está disponible para aumentar cantidad` });
        }
      }
    }

    // Detectar cambios reales para armar el mensaje de notificación
    const cambios = [];
    const idsAEliminar = [];
    const actualizacionesPorId = new Map();

    for (const item of items) {
      const itemActual = itemsPorId.get(item.id);
      const nombreProducto = itemActual.productos?.nombre_comercial || 'Producto';

      if (item.cantidad === itemActual.cantidad) continue;

      if (item.cantidad === 0) {
        idsAEliminar.push(item.id);
        cambios.push(`${nombreProducto}: eliminado (no disponible)`);
      } else {
        actualizacionesPorId.set(item.id, item.cantidad);
        cambios.push(`${nombreProducto}: ${itemActual.cantidad} → ${item.cantidad} unidades`);
      }
    }

    if (cambios.length === 0) {
      return res.status(400).json({ error: 'No hay cambios que aplicar' });
    }

    if (idsAEliminar.length === itemsActuales.length) {
      return res.status(400).json({ error: 'La orden debe conservar al menos un producto. Si necesitás vaciarla, cancelala en su lugar.' });
    }

    if (idsAEliminar.length > 0) {
      const { error: errorDelete } = await supabase
        .from('ordenes_items')
        .delete()
        .in('id', idsAEliminar);
      if (errorDelete) throw errorDelete;
    }

    for (const [itemId, cantidad] of actualizacionesPorId) {
      const { error: errorUpdate } = await supabase
        .from('ordenes_items')
        .update({ cantidad })
        .eq('id', itemId);
      if (errorUpdate) throw errorUpdate;
    }

    // Recalcular total: items restantes con su precio congelado + envío original
    const { data: itemsRestantes, error: errorRestantes } = await supabase
      .from('ordenes_items')
      .select('cantidad, precio_unitario')
      .eq('orden_id', id);

    if (errorRestantes) throw errorRestantes;

    const costoEnvio = Number(ordenActual.costo_delivery || 0);
    const nuevoTotal = itemsRestantes.reduce(
      (sum, item) => sum + Number(item.precio_unitario) * item.cantidad,
      0
    ) + costoEnvio;

    const { data: ordenActualizada, error: errorTotal } = await supabase
      .from('ordenes')
      .update({ total_usd: nuevoTotal })
      .eq('id', id)
      .select('*, ordenes_items(*, productos(nombre_comercial))')
      .single();

    if (errorTotal) throw errorTotal;

    await crearNotificacion(
      ordenActual.usuario_id,
      'orden_ajustada',
      'Tu pedido fue ajustado',
      `Tu orden #${id} fue ajustada según disponibilidad de stock: ${cambios.join('; ')}. Nuevo total: $${nuevoTotal.toFixed(2)}.`,
      Number(id)
    );

    res.json({
      ...ordenActualizada,
      ordenes_items: Array.isArray(ordenActualizada.ordenes_items) ? ordenActualizada.ordenes_items : []
    });
  } catch (err) {
    console.error('Error al ajustar items de la orden:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE /orders/:id - Cancelar orden
export async function cancelarOrden(req, res) {
  const { id } = req.params;
  const { motivo } = req.body;

  try {
    const { data: ordenActual, error: errorActual } = await supabase
      .from('ordenes')
      .select('*')
      .eq('id', id)
      .single();

    if (errorActual || !ordenActual) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    if (!req.user.es_admin) {
      return res.status(403).json({ error: 'No autorizado para cancelar órdenes' });
    }

    if (ordenActual.estado === 'cancelado') {
      return res.status(400).json({ error: 'La orden ya está cancelada' });
    }

    const data = await aplicarCambioEstado(ordenActual, 'cancelado');

    const { data: cancelada, error: errorCancelacion } = await supabase
      .from('ordenes')
      .update({ 
        estado_pago: 'cancelado',
        motivo_cancelacion: motivo || null
      })
      .eq('id', data.id)
      .select()
      .single();

    if (errorCancelacion) throw errorCancelacion;

    await crearNotificacion(
      data.usuario_id,
      'orden_cancelada',
      'Orden cancelada',
      `Tu orden #${data.id} fue cancelada${motivo ? `: ${motivo}` : ''}`,
      data.id
    );

    res.json(cancelada);
  } catch (err) {
    console.error('Error al cancelar orden:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}