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

// Transiciones permitidas entre estados para validar el flujo
const TRANSICIONES_PERMITIDAS = {
  pedido_creado: ['procesando', 'cancelado'],
  procesando: ['preparando', 'cancelado'],
  preparando: ['enviado', 'cancelado'],
  enviado: ['entregado', 'cancelado'],
  entregado: [], // Estado terminal
  cancelado: []  // Estado terminal
};

// Normaliza estados heredados (de antes de este pipeline) al nuevo set,
// para que órdenes viejas sigan mostrando algo coherente en el timeline.
function normalizarEstado(estado) {
  const mapa = {
    pendiente: 'pedido_creado',
    confirmado: 'procesando',
    en_preparacion: 'preparando',
    finalizado: 'entregado'
  };
  return mapa[estado] || estado;
}

// Valida que una transición de estado sea permitida según el pipeline
function validarTransicion(estadoActual, nuevoEstado) {
  const transicionesPermitidas = TRANSICIONES_PERMITIDAS[estadoActual];
  if (!transicionesPermitidas) {
    return false;
  }
  return transicionesPermitidas.includes(nuevoEstado);
}

// Calcula el saldo disponible de crédito de un usuario
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

// Verifica si un usuario tiene órdenes vencidas pendientes de pago
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

// Valida los items de la orden
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

// Crea una orden con items de forma atómica usando transacción
async function crearOrdenTransaccional(datosOrden, itemsConPrecio) {
  const { data: orden, error: errorOrden } = await supabase
    .from('ordenes')
    .insert(datosOrden)
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
    // Rollback: eliminar la orden si falla la inserción de items
    await supabase.from('ordenes').delete().eq('id', orden.id);
    throw errorItems;
  }

  return orden;
}

// POST /orders
export async function createOrden(req, res) {
  const { items, forma_pago, sub_usuario_id, costo_envio_usd } = req.body;

  // Solo un admin puede crear la orden a nombre de otro usuario.
  const usuario_id = (req.user.es_admin && req.body.usuario_id)
    ? req.body.usuario_id
    : req.user.id;

  // Validar items
  const errorValidacion = validarItems(items);
  if (errorValidacion) {
    return res.status(400).json({ error: errorValidacion });
  }

  const envio = Number(costo_envio_usd) > 0 ? Number(costo_envio_usd) : 0;

  // forma_pago solo puede ser 'contado' o 'credito'. Si no viene, asumimos contado.
  const formaPagoSolicitada = forma_pago === 'credito' ? 'credito' : 'contado';

  try {
    // Validar sub-usuario si viene
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

    // Obtener productos
    const productoIds = items.map(item => item.producto_id);
    const { data: productos, error: errorProductos } = await supabase
      .from('productos')
      .select('id, precio_usd, disponible')
      .in('id', productoIds);

    if (errorProductos) throw errorProductos;

    // Validar que todos los productos existan y estén disponibles
    for (const item of items) {
      const producto = productos.find(p => p.id === item.producto_id);
      if (!producto) {
        return res.status(400).json({ error: `Producto ${item.producto_id} no existe` });
      }
      if (!producto.disponible) {
        return res.status(400).json({ error: `Producto ${item.producto_id} no disponible` });
      }
    }

    // Calcular totales
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

    // Validación de crédito
    let forma_pago_final = 'contado';
    let fecha_vencimiento = null;

    if (formaPagoSolicitada === 'credito') {
      try {
        // Verificar si tiene órdenes vencidas
        const tieneVencidas = await tieneOrdenesVencidas(usuario_id);
        
        if (tieneVencidas) {
          return res.status(403).json({
            error: 'Tenés órdenes vencidas pendientes de pago. Regularizá tu cuenta para seguir comprando a crédito.',
            codigo: 'CUENTA_CON_VENCIDAS',
          });
        }

        // Calcular saldo disponible
        const creditoInfo = await calcularSaldoCredito(usuario_id);
        
        if (creditoInfo.saldo_disponible >= total_usd) {
          forma_pago_final = 'credito';
          
          if (creditoInfo.dias_credito) {
            const vencimiento = new Date();
            vencimiento.setDate(vencimiento.getDate() + Number(creditoInfo.dias_credito));
            fecha_vencimiento = vencimiento.toISOString();
          }
        }
        // Si no alcanza el saldo, queda como contado silenciosamente
      } catch (errorCredito) {
        console.error('Error al validar crédito:', errorCredito);
        // Si hay error en la validación de crédito, continuar como contado
        forma_pago_final = 'contado';
        fecha_vencimiento = null;
      }
    }

    // Crear orden con items
    const orden = await crearOrdenTransaccional(
      {
        usuario_id,
        estado: 'pedido_creado',
        total_usd,
        forma_pago: forma_pago_final,
        fecha_vencimiento,
        sub_usuario_id: subUsuarioValidado
      },
      itemsConPrecio
    );

    // Registrar historial
    await supabase.from('ordenes_historial').insert({
      orden_id: orden.id,
      estado: 'pedido_creado'
    });

    // Crear notificación
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
    
    // Manejo de errores específicos
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflicto de datos' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Referencia inválida' });
    }
    
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /orders
export async function getOrdenes(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('ordenes')
      .select('*, users(id, nombre, email), ordenes_items(*, productos(nombre_comercial))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!req.user.es_admin) {
      query = query.eq('usuario_id', req.user.id);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    console.error('Error al obtener órdenes:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /orders/:id — incluye el historial de estados para el timeline
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

    // Fallback para órdenes creadas antes de que existiera la tabla de historial
    const historialFinal = (historial && historial.length > 0)
      ? historial
      : [{ estado: normalizarEstado(data.estado), fecha: data.created_at }];

    res.json({ ...data, historial: historialFinal });
  } catch (err) {
    console.error('Error al obtener orden:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// Mensajes de notificación por transición de estado
function mensajeParaTransicion(estado, forma_pago, ordenId) {
  if (estado === 'procesando') {
    if (forma_pago === 'contado') {
      return `¡Tu orden #${ordenId} está lista! Ya puedes proceder con el pago.`;
    }
    return null; // A crédito no se notifica el paso a 'procesando'
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

// Aplica un cambio de estado a una orden
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

  return data;
}

// GET /orders/pendientes-pago
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

    // Calcular total pendiente
    const totalPendiente = data.reduce((sum, orden) => sum + Number(orden.total_usd), 0);

    res.json({
      ordenes: data,
      total_ordenes: data.length,
      total_pendiente: totalPendiente
    });
  } catch (err) {
    console.error('Error al obtener órdenes pendientes de pago:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /orders/vencidas — obtiene órdenes a crédito vencidas
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

    res.json({
      ordenes: data,
      total_vencidas: data.length,
      total_adeudado: data.reduce((sum, orden) => sum + Number(orden.total_usd), 0)
    });
  } catch (err) {
    console.error('Error al obtener órdenes vencidas:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /orders/:id/estado
export async function updateEstadoOrden(req, res) {
  const { id } = req.params;
  const { estado } = req.body;

  // Validar que el estado sea válido
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  try {
    // Obtener orden actual
    const { data: ordenActual, error: errorActual } = await supabase
      .from('ordenes')
      .select('*')
      .eq('id', id)
      .single();

    if (errorActual || !ordenActual) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    // Verificar permisos (solo admin puede cambiar estados)
    if (!req.user.es_admin) {
      return res.status(403).json({ error: 'No autorizado para cambiar estados' });
    }

    // Validar transición
    if (!validarTransicion(ordenActual.estado, estado)) {
      return res.status(400).json({
        error: `Transición inválida de ${ordenActual.estado} a ${estado}`,
        transiciones_permitidas: TRANSICIONES_PERMITIDAS[ordenActual.estado]
      });
    }

    // Aplicar cambio de estado
    let data = await aplicarCambioEstado(ordenActual, estado);

    // Bifurcación crédito/contado al entrar a 'procesando'
    if (estado === 'procesando') {
      if (data.forma_pago === 'credito') {
        // A crédito: avanza directo a preparando
        data = await aplicarCambioEstado(data, 'preparando');
      } else {
        // A contado: abre ventana de pago
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

    // Si se cancela, actualizar estado_pago
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

    res.json(data);
  } catch (err) {
    console.error('Error al actualizar estado:', err);
    
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflicto de datos' });
    }
    
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /orders/stats — estadísticas para dashboard
export async function getOrdenesStats(req, res) {
  try {
    const usuario_id = req.user.id;
    
    const { data: stats, error } = await supabase
      .from('ordenes')
      .select(`
        estado,
        forma_pago,
        estado_pago,
        total_usd,
        created_at
      `)
      .eq('usuario_id', usuario_id);

    if (error) throw error;

    const resumen = {
      total_ordenes: stats.length,
      total_gastado: stats.reduce((sum, o) => sum + Number(o.total_usd), 0),
      por_estado: {},
      por_forma_pago: {},
      ultimas_30_dias: stats.filter(o => {
        const fecha = new Date(o.created_at);
        const hace30Dias = new Date();
        hace30Dias.setDate(hace30Dias.getDate() - 30);
        return fecha >= hace30Dias;
      }).length
    };

    // Agrupar por estado
    stats.forEach(orden => {
      resumen.por_estado[orden.estado] = (resumen.por_estado[orden.estado] || 0) + 1;
      resumen.por_forma_pago[orden.forma_pago] = (resumen.por_forma_pago[orden.forma_pago] || 0) + 1;
    });

    res.json(resumen);
  } catch (err) {
    console.error('Error al obtener estadísticas:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE /orders/:id — cancelar orden (solo admin)
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

    // Aplicar cancelación
    const data = await aplicarCambioEstado(ordenActual, 'cancelado');

    // Actualizar estado_pago
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

    // Notificar cancelación
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