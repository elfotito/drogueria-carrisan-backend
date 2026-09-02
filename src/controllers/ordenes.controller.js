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
// Error controlado de validación de negocio dentro de construirOrden.
// Permite que cada wrapper (cliente, staff) devuelva el status/mensaje
// correcto sin duplicar los ifs de validación.
export class ErrorOrden extends Error {
  constructor(status, mensaje, extra = null) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

// Lógica compartida de creación de orden. usuario_id es siempre el dueño
// de la cuenta que se factura (cliente) — quien la ejecuta (cliente vía
// checkout, o staff vía panel de vendedor) no cambia eso, solo cambia
// quién queda registrado como creador (ver creado_por_staff_id).
//
// opciones.saltarValidacionPin: cuando un vendedor crea el pedido no hay
// sesión de cliente de la que identificar un sub-usuario por PIN — se
// omite ese chequeo por completo (sub_usuario_id queda null) en vez de
// forzar al vendedor a conocer el PIN del cliente.
export async function construirOrden(usuario_id, datos, opciones = {}) {
  const {
    items, forma_pago, sub_usuario_id,
    tipo_envio, direccion_envio_id, agencia_envio,
  } = datos;
  const { creado_por_staff_id = null, saltarValidacionPin = false } = opciones;

  const errorValidacion = validarItems(items);
  if (errorValidacion) {
    throw new ErrorOrden(400, errorValidacion);
  }

  const TIPOS_ENVIO_VALIDOS = ['retiro', 'delivery', 'envio_nacional'];
  const tipoEnvioValido = TIPOS_ENVIO_VALIDOS.includes(tipo_envio) ? tipo_envio : 'retiro';
  const formaPagoSolicitada = forma_pago === 'credito' ? 'credito' : 'contado';

  // --- Validar dirección/agencia según el tipo de envío elegido ---
  let direccionValidada = null;
  let direccion = null;
  if (tipoEnvioValido === 'delivery' || tipoEnvioValido === 'envio_nacional') {
    if (!direccion_envio_id) {
      throw new ErrorOrden(400, 'Debes seleccionar una dirección de envío');
    }

    const { data: dir, error: errorDireccion } = await supabase
      .from('direcciones_envio')
      .select('id, usuario_id, ciudad, activo')
      .eq('id', direccion_envio_id)
      .single();

    if (errorDireccion || !dir || dir.usuario_id !== usuario_id || !dir.activo) {
      throw new ErrorOrden(400, 'Dirección de envío inválida');
    }
    direccion = dir;
    direccionValidada = dir.id;
  }

  if (tipoEnvioValido === 'envio_nacional' && !agencia_envio) {
    throw new ErrorOrden(400, 'Debes indicar la agencia de envío');
  }

  // --- Costo de envío: SIEMPRE se calcula en el servidor. Nunca se
  // confía en un costo enviado por el cliente (evita que alguien
  // manipule la petición para llevarse el delivery gratis). ---
  let envio = 0;
  if (tipoEnvioValido === 'delivery') {
    const { data: clienteDelivery, error: errorClienteDelivery } = await supabase
      .from('users')
      .select('delivery_gratis')
      .eq('id', usuario_id)
      .single();

    if (errorClienteDelivery || !clienteDelivery) {
      throw new ErrorOrden(400, 'Usuario no encontrado');
    }

    if (clienteDelivery.delivery_gratis) {
      envio = 0;
    } else {
      const { data: tarifa } = await supabase
        .from('tarifas_delivery')
        .select('costo')
        .eq('ciudad', direccion.ciudad)
        .eq('activo', true)
        .single();
      envio = tarifa?.costo ?? 8.00;
    }
  }
  // 'envio_nacional' se paga en destino (0 acá) y 'retiro' no tiene costo.

  let subUsuarioValidado = null;
  if (!saltarValidacionPin) {
    if (sub_usuario_id) {
      const { data: subUsuario, error: errorSub } = await supabase
        .from('sub_usuarios')
        .select('id, usuario_id, activo')
        .eq('id', sub_usuario_id)
        .single();

      if (errorSub || !subUsuario || subUsuario.usuario_id !== usuario_id || !subUsuario.activo) {
        throw new ErrorOrden(400, 'Sub-usuario inválido');
      }
      subUsuarioValidado = subUsuario.id;
    } else {
      // Si la cuenta tiene sub-usuarios activos configurados, identificar
      // quién hace el pedido deja de ser opcional: sin esto, cualquiera
      // con la sesión abierta podría comprar sin dejar rastro de cuál
      // miembro del equipo lo hizo (todo el propósito de la feature).
      const { count: subUsuariosActivos } = await supabase
        .from('sub_usuarios')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', usuario_id)
        .eq('activo', true);

      if (subUsuariosActivos > 0) {
        throw new ErrorOrden(400, 'Debes indicar el PIN de quién hace este pedido');
      }
    }
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
      throw new ErrorOrden(400, `Producto ${item.producto_id} no existe`);
    }
    if (!producto.disponible) {
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

  total_usd += envio;

  let forma_pago_final = 'contado';
  let fecha_vencimiento = null;

  if (formaPagoSolicitada === 'credito') {
    try {
      const tieneVencidas = await tieneOrdenesVencidas(usuario_id);

      if (tieneVencidas) {
        throw new ErrorOrden(
          403,
          'Tenés órdenes vencidas pendientes de pago. Regularizá tu cuenta para seguir comprando a crédito.',
          { codigo: 'CUENTA_CON_VENCIDAS' }
        );
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
      if (errorCredito instanceof ErrorOrden) throw errorCredito;
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
      sub_usuario_id: subUsuarioValidado,
      tipo_envio: tipoEnvioValido,
      direccion_envio_id: direccionValidada,
      costo_envio_usd: envio,
      agencia_envio: tipoEnvioValido === 'envio_nacional' ? agencia_envio : null,
      creado_por_staff_id,
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

  return { ...orden, items: itemsConPrecio };
}

function responderErrorOrden(err, res, mensajeLog) {
  if (err instanceof ErrorOrden) {
    return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  }
  console.error(mensajeLog, err);
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Conflicto de datos' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referencia inválida' });
  }
  res.status(500).json({ error: 'Error del servidor' });
}

// POST /orders
export async function createOrden(req, res) {
  const usuario_id = (req.user.es_admin && req.body.usuario_id)
    ? req.body.usuario_id
    : req.user.id;

  try {
    const orden = await construirOrden(usuario_id, req.body);
    res.status(201).json(orden);
  } catch (err) {
    responderErrorOrden(err, res, 'Error al crear orden:');
  }
}

// GET /orders - CORREGIDO: Devuelve array directo para compatibilidad
export async function getOrdenes(req, res) {
  try {
    let query = supabase
      .from('ordenes')
      .select('*, users(id, nombre, email), direcciones_envio(direccion, ciudad, estado), ordenes_items(*, productos(nombre_comercial))')
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
      .select('*, users(id, nombre, email), direcciones_envio(direccion, ciudad, estado), ordenes_items(*, productos(nombre_comercial))')
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

// GET /orders/delivery-pendientes — Ordenes delivery en preparación + enviados recientes
export async function getDeliveryPendientes(req, res) {
  try {
    const { data: pendientes, error: errorPendientes } = await supabase
      .from('ordenes')
      .select('*, users(id, nombre, email, telefono), direcciones_envio(direccion, ciudad, estado), ordenes_items(*, productos(nombre_comercial))')
      .eq('tipo_envio', 'delivery')
      .eq('estado', 'preparando')
      .order('created_at', { ascending: true });

    if (errorPendientes) throw errorPendientes;

    const { data: enviadosRecientes, error: errorEnviados } = await supabase
      .from('ordenes')
      .select('*, users(id, nombre, email, telefono), direcciones_envio(direccion, ciudad, estado), ordenes_items(*, productos(nombre_comercial))')
      .eq('tipo_envio', 'delivery')
      .eq('estado', 'enviado')
      .order('created_at', { ascending: false })
      .limit(20);

    if (errorEnviados) throw errorEnviados;

    res.json({
      pendientes: (pendientes || []).map(o => ({
        ...o,
        ordenes_items: Array.isArray(o.ordenes_items) ? o.ordenes_items : []
      })),
      enviadosRecientes: (enviadosRecientes || []).map(o => ({
        ...o,
        ordenes_items: Array.isArray(o.ordenes_items) ? o.ordenes_items : []
      }))
    });
  } catch (err) {
    console.error('Error al obtener deliveries pendientes:', err);
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
  let { data, error } = await supabase
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

// Estados en los que un admin puede editar los items de una orden.
// Una vez en 'preparando' la mercancía ya se está armando físicamente,
// así que editar cantidades desde ahí en adelante queda bloqueado.
const ESTADOS_EDITABLES_ITEMS = ['pedido_creado', 'procesando'];

// PATCH /:id/items — solo admin. Reemplaza por completo la lista de
// items de una orden existente (no hace merge parcial: el body debe
// traer la lista final completa, igual que createOrden). Recalcula
// total_usd server-side a partir de los precios actuales de catálogo,
// nunca confía en precios que pudiera mandar el cliente.
export async function updateItemsOrden(req, res) {
  const { id } = req.params;
  const { items } = req.body;

  if (!req.user.es_admin) {
    return res.status(403).json({ error: 'No autorizado para editar items de una orden' });
  }

  const errorValidacion = validarItems(items);
  if (errorValidacion) {
    return res.status(400).json({ error: errorValidacion });
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

    if (!ESTADOS_EDITABLES_ITEMS.includes(ordenActual.estado)) {
      return res.status(400).json({
        error: `No se pueden editar los items de una orden en estado "${LABELS_ESTADO[ordenActual.estado] || ordenActual.estado}"`,
        estados_editables: ESTADOS_EDITABLES_ITEMS
      });
    }

    // Igual que en createOrden: se valida que cada producto exista y
    // esté disponible, y el precio se toma siempre del catálogo actual
    // (nunca de lo que mande el cliente en el body).
    const productoIds = items.map((item) => item.producto_id);
    const { data: productos, error: errorProductos } = await supabase
      .from('productos')
      .select('id, precio_usd, disponible')
      .in('id', productoIds);

    if (errorProductos) throw errorProductos;

    for (const item of items) {
      const producto = productos.find((p) => p.id === item.producto_id);
      if (!producto) {
        return res.status(400).json({ error: `Producto ${item.producto_id} no existe` });
      }
      if (!producto.disponible) {
        return res.status(400).json({ error: `Producto ${item.producto_id} no disponible` });
      }
    }

    let total_usd = 0;
    const itemsConPrecio = items.map((item) => {
      const producto = productos.find((p) => p.id === item.producto_id);
      total_usd += producto.precio_usd * item.cantidad;
      return {
        orden_id: ordenActual.id,
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        precio_unitario: producto.precio_usd
      };
    });

    total_usd += Number(ordenActual.costo_envio_usd || 0);

    // Reemplazo completo: se borran los items anteriores y se insertan
    // los nuevos, dentro del mismo flujo (si el insert falla, se
    // reintentan los originales para no dejar la orden sin items).
    const { data: itemsAnteriores, error: errorItemsAnteriores } = await supabase
      .from('ordenes_items')
      .select('*')
      .eq('orden_id', ordenActual.id);

    if (errorItemsAnteriores) throw errorItemsAnteriores;

    const { error: errorBorrar } = await supabase
      .from('ordenes_items')
      .delete()
      .eq('orden_id', ordenActual.id);

    if (errorBorrar) throw errorBorrar;

    const { error: errorInsertar } = await supabase
      .from('ordenes_items')
      .insert(itemsConPrecio);

    if (errorInsertar) {
      // Rollback manual: restauramos los items previos para no dejar
      // la orden sin ningún item si la inserción de los nuevos falló.
      if (itemsAnteriores?.length) {
        await supabase.from('ordenes_items').insert(
          itemsAnteriores.map(({ id: _itemId, ...resto }) => resto)
        );
      }
      throw errorInsertar;
    }

    const { data: ordenActualizada, error: errorUpdateTotal } = await supabase
      .from('ordenes')
      .update({ total_usd })
      .eq('id', ordenActual.id)
      .select()
      .single();

    if (errorUpdateTotal) throw errorUpdateTotal;

    await crearNotificacion(
      ordenActual.usuario_id,
      'orden_actualizada',
      'Tu orden fue actualizada',
      `Los productos de tu orden #${ordenActual.id} fueron ajustados. Nuevo total: $${total_usd}.`,
      ordenActual.id
    );

    res.json({ ...ordenActualizada, items: itemsConPrecio });
  } catch (err) {
    console.error('Error al actualizar items de orden:', err);

    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflicto de datos' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Referencia inválida' });
    }

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