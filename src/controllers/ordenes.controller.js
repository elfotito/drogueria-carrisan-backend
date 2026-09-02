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

// ---------------------------------------------------------
// Pipeline lineal estricto: cada estado solo puede avanzar al
// siguiente inmediato, sin saltarse pasos. 'cancelado' es alcanzable
// desde cualquier estado no terminal. No hay retrocesos.
// ---------------------------------------------------------
const TRANSICIONES_PERMITIDAS = {
  pedido_creado: ['procesando', 'cancelado'],
  procesando: ['preparando', 'cancelado'],
  preparando: ['enviado', 'cancelado'],
  enviado: ['entregado', 'cancelado'],
  entregado: [],
  cancelado: []
};

export function validarTransicion(estadoActual, estadoNuevo) {
  const permitidas = TRANSICIONES_PERMITIDAS[estadoActual];
  return Array.isArray(permitidas) && permitidas.includes(estadoNuevo);
}

// ---------------------------------------------------------
// Error de dominio para el flujo de órdenes: permite que
// construirOrden() reporte fallos de validación con su código HTTP
// correcto, sin que cada caller tenga que reinterpretar mensajes.
// ---------------------------------------------------------
export class ErrorOrden extends Error {
  constructor(status, message, extra = null) {
    super(message);
    this.name = 'ErrorOrden';
    this.status = status;
    this.extra = extra;
  }
}

// POST /orders
export async function createOrden(req, res) {
  const { items, forma_pago, tipo_envio, direccion_envio_id, agencia_envio } = req.body;
  const usuario_id = req.user.id;

  try {
    const orden = await construirOrden(
      usuario_id,
      { items, forma_pago, tipo_envio, direccion_envio_id, agencia_envio },
      {}
    );
    res.status(201).json(orden);
  } catch (err) {
    if (err instanceof ErrorOrden) {
      return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    }
    console.error('Error al crear orden:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ---------------------------------------------------------
// construirOrden: lógica de negocio pura para crear una orden,
// reutilizable tanto por el checkout normal (createOrden) como por
// staff.controller.js (crearOrdenParaCliente). No conoce req/res —
// reporta fallos lanzando ErrorOrden, y el caller HTTP decide cómo
// responder.
//
// opciones:
//   - creado_por_staff_id: si la orden la genera un vendedor, lo deja
//     registrado en la orden para trazabilidad.
//   - saltarValidacionPin: reservado para cuando staff crea la orden
//     (no hay sesión de sub-usuario de la que validar PIN).
// ---------------------------------------------------------
export async function construirOrden(usuario_id, datos, opciones = {}) {
  const { items, forma_pago, tipo_envio, direccion_envio_id, agencia_envio } = datos;
  const { creado_por_staff_id = null } = opciones;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ErrorOrden(400, 'Debe incluir al menos un item');
  }

  // forma_pago solo puede ser 'contado' o 'credito'. Si no viene, asumimos contado.
  const formaPagoSolicitada = forma_pago === 'credito' ? 'credito' : 'contado';

  const productoIds = items.map(item => item.producto_id);
  const { data: productos, error: errorProductos } = await supabase
    .from('productos')
    .select('id, precio_usd, disponible')
    .in('id', productoIds);

  if (errorProductos) throw errorProductos;

  // Validar que todos los productos existan y estén disponibles
  for (const item of items) {
    const producto = productos.find(p => p.id === item.producto_id);
    if (!producto || !producto.disponible) {
      throw new ErrorOrden(400, `Producto ${item.producto_id} no disponible`);
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

  // -----------------------------------------------------------------
  // Validación de crédito: NUNCA confiar en lo que mande el frontend.
  // Si el cliente pidió 'credito', recalculamos su saldo disponible
  // (linea_credito - deuda_actual) server-side antes de aceptarlo.
  // -----------------------------------------------------------------
  let forma_pago_final = 'contado';
  if (formaPagoSolicitada === 'credito') {
    const { data: cliente, error: errorCliente } = await supabase
      .from('users')
      .select('linea_credito')
      .eq('id', usuario_id)
      .single();

    if (errorCliente || !cliente) throw errorCliente || new ErrorOrden(404, 'Usuario no encontrado');

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

    if (saldo_disponible >= total_usd) {
      forma_pago_final = 'credito';
    }
    // Si no alcanza el saldo, forma_pago_final se queda en 'contado'
    // silenciosamente — el frontend ya debería haber ocultado la opción,
    // esto es solo la última línea de defensa.
  }

  // Las órdenes a contado nacen esperando llegar a 'procesando' para
  // habilitar el pago; estado_pago se setea ahí, no aquí (ver updateEstadoOrden).
  const nuevaOrden = {
    usuario_id,
    estado: 'pedido_creado',
    total_usd,
    forma_pago: forma_pago_final
  };
  if (tipo_envio) nuevaOrden.tipo_envio = tipo_envio;
  if (direccion_envio_id) nuevaOrden.direccion_envio_id = direccion_envio_id;
  if (agencia_envio) nuevaOrden.agencia_envio = agencia_envio;
  if (creado_por_staff_id) nuevaOrden.creado_por_staff_id = creado_por_staff_id;

  const { data: orden, error: errorOrden } = await supabase
    .from('ordenes')
    .insert(nuevaOrden)
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

  // Primer registro del historial de la orden
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

  return { ...orden, items: itemsConPrecio };
}

// GET /orders
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
    res.json(data);
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

    // Fallback para órdenes creadas antes de que existiera la tabla de
    // historial: sintetizamos una única entrada con la fecha de creación.
    const historialFinal = (historial && historial.length > 0)
      ? historial
      : [{ estado: normalizarEstado(data.estado), fecha: data.created_at }];

    res.json({ ...data, historial: historialFinal });
  } catch (err) {
    console.error('Error al obtener orden:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// Mensajes de notificación por transición de estado, diferenciados por
// forma_pago. Si una combinación no tiene mensaje especial acá, se usa
// el genérico de LABELS_ESTADO como fallback.
function mensajeParaTransicion(estado, forma_pago, ordenId) {
  if (estado === 'procesando') {
    if (forma_pago === 'contado') {
      return `¡Tu orden #${ordenId} está lista! Ya puedes proceder con el pago.`;
    }
    // A crédito no se notifica el paso a 'procesando' (avanza y se
    // encadena a 'preparando' en el mismo momento, ver abajo).
    return null;
  }
  if (estado === 'enviado') {
    return `Tu orden #${ordenId} salió de nuestro almacén rumbo a destino.`;
  }
  if (estado === 'entregado') {
    return `Tu orden #${ordenId} fue entregada con éxito.`;
  }
  return `Tu orden #${ordenId} cambió a: ${LABELS_ESTADO[estado] || estado}`;
}

// Calcula fecha_vencimiento para órdenes a crédito al entrar a
// 'preparando': hoy + dias_credito del cliente. Si el cliente no tiene
// dias_credito configurado, no se setea (el admin la gestiona a mano).
async function calcularFechaVencimiento(usuario_id) {
  const { data: cliente, error } = await supabase
    .from('users')
    .select('dias_credito')
    .eq('id', usuario_id)
    .single();

  if (error || !cliente || !cliente.dias_credito) return null;

  const fecha = new Date();
  fecha.setDate(fecha.getDate() + Number(cliente.dias_credito));
  return fecha.toISOString();
}

// Aplica un cambio de estado a una orden: actualiza fila, registra
// historial y notifica. No hace la validación de ESTADOS_VALIDOS/
// TRANSICIONES_PERMITIDAS (eso lo hace el endpoint que llama a esta
// función) — sí calcula fecha_vencimiento al entrar a 'preparando' en
// órdenes a crédito.
export async function aplicarCambioEstado(orden, estado) {
  const cambios = { estado };

  if (estado === 'preparando' && orden.forma_pago === 'credito' && !orden.fecha_vencimiento) {
    const fechaVencimiento = await calcularFechaVencimiento(orden.usuario_id);
    if (fechaVencimiento) cambios.fecha_vencimiento = fechaVencimiento;
  }

  const { data, error } = await supabase
    .from('ordenes')
    .update(cambios)
    .eq('id', orden.id)
    .select()
    .single();

  if (error || !data) throw error || new Error('Orden no encontrada al actualizar estado');

  await supabase.from('ordenes_historial').insert({
    orden_id: data.id,
    estado
  });

  const mensaje = mensajeParaTransicion(estado, data.forma_pago, data.id);
  if (mensaje) {
    await crearNotificacion(data.usuario_id, 'estado_cambiado', 'Estado actualizado', mensaje, data.id);
  }

  return data;
}

// GET /orders/pendientes-pago — órdenes del usuario en 'procesando' a
// contado que están esperando o fueron rechazadas (para la pantalla de
// gestión de pagos, individual o multi-orden). Excluye las que ya están
// 'reportado' (esperando verificación) o 'verificado'.
export async function getOrdenesPendientesPago(req, res) {
  const usuario_id = req.user.id;

  try {
    const { data, error } = await supabase
      .from('ordenes')
      .select('*, ordenes_items(*, productos(nombre_comercial))')
      .eq('usuario_id', usuario_id)
      .eq('forma_pago', 'contado')
      .in('estado_pago', ['esperando', 'rechazado'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error al obtener órdenes pendientes de pago:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /orders/delivery-pendientes — cola de órdenes en estado 'enviado',
// las más antiguas primero (orden de despacho). Mismo criterio que
// getColaDespacho en staff.controller.js, expuesto también acá para el
// panel de Admin.
export async function getDeliveryPendientes(req, res) {
  try {
    const { data, error } = await supabase
      .from('ordenes')
      .select('*, users(id, nombre, email, telefono), direcciones_envio(direccion, ciudad, estado), ordenes_items(*, productos(nombre_comercial))')
      .eq('estado', 'enviado')
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json((data || []).map(o => ({
      ...o,
      ordenes_items: Array.isArray(o.ordenes_items) ? o.ordenes_items : []
    })));
  } catch (err) {
    console.error('Error al obtener órdenes pendientes de delivery:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /orders/:id/items — admin ajusta cantidades de items que YA
// existen en la orden (no agrega ni quita productos). Recalcula
// total_usd a partir de los items resultantes.
// Body esperado: { items: [{ id, cantidad }, ...] }
export async function updateItemsOrden(req, res) {
  const { id } = req.params;
  const { items: cambios } = req.body;

  if (!cambios || !Array.isArray(cambios) || cambios.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un item a actualizar' });
  }

  for (const c of cambios) {
    if (!c.id || !Number.isInteger(c.cantidad) || c.cantidad < 1) {
      return res.status(400).json({ error: 'Cada item requiere id y una cantidad entera mayor a 0' });
    }
  }

  try {
    const { data: ordenActual, error: errorOrden } = await supabase
      .from('ordenes')
      .select('id, ordenes_items(id, producto_id, cantidad, precio_unitario)')
      .eq('id', id)
      .single();

    if (errorOrden || !ordenActual) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const idsValidos = new Set(ordenActual.ordenes_items.map(i => i.id));
    for (const c of cambios) {
      if (!idsValidos.has(c.id)) {
        return res.status(400).json({ error: `El item ${c.id} no pertenece a esta orden` });
      }
    }

    // Aplica los cambios de cantidad, uno por uno (son pocos items por orden)
    for (const c of cambios) {
      const { error: errorUpdate } = await supabase
        .from('ordenes_items')
        .update({ cantidad: c.cantidad })
        .eq('id', c.id);

      if (errorUpdate) throw errorUpdate;
    }

    // Recalcula el total con los items ya actualizados
    const { data: itemsFinales, error: errorItems } = await supabase
      .from('ordenes_items')
      .select('cantidad, precio_unitario')
      .eq('orden_id', id);

    if (errorItems) throw errorItems;

    const nuevoTotal = itemsFinales.reduce(
      (sum, i) => sum + Number(i.precio_unitario) * i.cantidad,
      0
    );

    const { data: ordenActualizada, error: errorTotal } = await supabase
      .from('ordenes')
      .update({ total_usd: nuevoTotal })
      .eq('id', id)
      .select('*, ordenes_items(*, productos(nombre_comercial))')
      .single();

    if (errorTotal) throw errorTotal;

    res.json(ordenActualizada);
  } catch (err) {
    console.error('Error al actualizar items de la orden:', err);
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

    if (!validarTransicion(ordenActual.estado, estado)) {
      return res.status(400).json({ error: `No se puede pasar de ${ordenActual.estado} a ${estado}` });
    }

    let data = await aplicarCambioEstado(ordenActual, estado);

    // ---------------------------------------------------------------
    // Bifurcación crédito/contado al entrar a 'procesando':
    // - credito: no espera pago, se encadena directo a 'preparando'.
    // - contado: se abre la ventana de pago (estado_pago = 'esperando').
    // ---------------------------------------------------------------
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

    res.json(data);
  } catch (err) {
    console.error('Error al actualizar estado:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
