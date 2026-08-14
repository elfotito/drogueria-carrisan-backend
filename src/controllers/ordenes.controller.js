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
  const { items } = req.body;
  const usuario_id = req.user.id;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un item' });
  }

  try {
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

    const { data: orden, error: errorOrden } = await supabase
      .from('ordenes')
      .insert({ usuario_id, estado: 'pedido_creado', total_usd })
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

    await crearNotificacion(
      usuario_id,
      'orden_creada',
      'Orden creada',
      `Tu orden #${orden.id} por $${total_usd} fue recibida`,
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

// PATCH /orders/:id/estado
export async function updateEstadoOrden(req, res) {
  const { id } = req.params;
  const { estado } = req.body;

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  try {
    const { data, error } = await supabase
      .from('ordenes')
      .update({ estado })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    await supabase.from('ordenes_historial').insert({
      orden_id: data.id,
      estado
    });

    await crearNotificacion(
      data.usuario_id,
      'estado_cambiado',
      'Estado actualizado',
      `Tu orden #${data.id} cambió a: ${LABELS_ESTADO[estado] || estado}`,
      data.id
    );

    res.json(data);
  } catch (err) {
    console.error('Error al actualizar estado:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}