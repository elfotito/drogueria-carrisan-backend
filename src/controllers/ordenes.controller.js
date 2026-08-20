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

// POST /orders
export async function createOrden(req, res) {
  const { items, forma_pago, sub_usuario_id } = req.body;

  // Solo un admin puede crear la orden a nombre de otro usuario.
  const usuario_id = (req.user.es_admin && req.body.usuario_id)
    ? req.body.usuario_id
    : req.user.id;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un item' });
  }

  const envio = Number(costo_envio_usd) > 0 ? Number(costo_envio_usd) : 0;

  // forma_pago solo puede ser 'contado' o 'credito'. Si no viene, asumimos contado.
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

    // Validar que todos los productos existan y estén disponibles
    for (const item of items) {
      const producto = productos.find(p => p.id === item.producto_id);
      if (!producto || !producto.disponible) {
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

    // -----------------------------------------------------------------
    // Validación de crédito: NUNCA confiar en lo que mande el frontend.
    // Si el cliente pidió 'credito', recalculamos su saldo disponible
    // (linea_credito - deuda_actual) server-side antes de aceptarlo.
    // -----------------------------------------------------------------
    let forma_pago_final = 'contado';
    // Fecha límite de pago de esta orden — solo aplica a crédito. Se
    // calcula una única vez acá (created_at + dias_credito del cliente
    // en este momento) y queda congelada en la orden; no se recalcula
    // si más adelante cambia el plazo del cliente. En contado la orden
    // no vence por fecha, simplemente no avanza hasta recibir el pago.
    let fecha_vencimiento = null;

    if (formaPagoSolicitada === 'credito') {
      const { data: cliente, error: errorCliente } = await supabase
        .from('users')
        .select('linea_credito, dias_credito')
        .eq('id', usuario_id)
        .single();

      if (errorCliente || !cliente) throw errorCliente || new Error('Usuario no encontrado');

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

      // Bloqueo por órdenes vencidas: un cliente con al menos una orden
      // a crédito ya vencida no puede seguir comprando a crédito hasta
      // regularizar. Contado no se ve afectado por esto — por eso el
      // check vive acá adentro del branch de crédito, no antes.
      const { data: ordenesVencidas, error: errorVencidas } = await supabase
        .from('ordenes')
        .select('id')
        .eq('usuario_id', usuario_id)
        .neq('estado', 'cancelado')
        .neq('estado_pago', 'verificado')
        .not('fecha_vencimiento', 'is', null)
        .lt('fecha_vencimiento', new Date().toISOString());

      if (errorVencidas) throw errorVencidas;

      if (ordenesVencidas && ordenesVencidas.length > 0) {
        return res.status(403).json({
          error: 'Tenés órdenes vencidas pendientes de pago. Regularizá tu cuenta para seguir comprando a crédito.',
          codigo: 'CUENTA_CON_VENCIDAS',
        });
      }

      if (saldo_disponible >= total_usd) {
        forma_pago_final = 'credito';

        if (cliente.dias_credito) {
          const vencimiento = new Date();
          vencimiento.setDate(vencimiento.getDate() + Number(cliente.dias_credito));
          fecha_vencimiento = vencimiento.toISOString();
        }
        // Si el cliente todavía no tiene dias_credito configurado,
        // la orden queda a crédito pero sin fecha de vencimiento —
        // no se marcará como vencida hasta que se le fije un plazo.
      }
      // Si no alcanza el saldo, forma_pago_final se queda en 'contado'
      // silenciosamente — el frontend ya debería haber ocultado la opción,
      // esto es solo la última línea de defensa.
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
    res.status(500).json({ error: 'Error del servidor' });
  }
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

// Aplica un cambio de estado a una orden: actualiza fila, registra
// historial y notifica. No hace la validación de ESTADOS_VALIDOS (eso
// se hace una sola vez en el endpoint que llama a esta función).
async function aplicarCambioEstado(orden, estado) {
  const { data, error } = await supabase
    .from('ordenes')
    .update({ estado })
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