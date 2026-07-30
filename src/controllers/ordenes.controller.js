import { supabase } from '../config/supabase.js';

// POST /orders
export async function createOrden(req, res) {
  const { items } = req.body; // [{ producto_id, cantidad }, ...]
  const usuario_id = req.user.id; // viene del JWT, no del body (seguridad)

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un item' });
  }

  try {
    // 1. Traer los precios REALES de la base de datos (nunca confiar en precios del frontend)
    const productoIds = items.map(item => item.producto_id);
    const { data: productos, error: errorProductos } = await supabase
      .from('productos')
      .select('id, precio_usd, activo')
      .in('id', productoIds);

    if (errorProductos) throw errorProductos;

    // 2. Validar que todos los productos existan y estén activos
    for (const item of items) {
      const producto = productos.find(p => p.id === item.producto_id);
      if (!producto || !producto.activo) {
        return res.status(400).json({ error: `Producto ${item.producto_id} no disponible` });
      }
    }

    // 3. Calcular el total usando precios reales de la BD
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

    // 4. Crear la orden
    const { data: orden, error: errorOrden } = await supabase
      .from('ordenes')
      .insert({ usuario_id, estado: 'pendiente', total_usd })
      .select()
      .single();

    if (errorOrden) throw errorOrden;

    // 5. Crear los items de esa orden
    const itemsParaInsertar = itemsConPrecio.map(item => ({
      ...item,
      orden_id: orden.id
    }));

    const { error: errorItems } = await supabase
      .from('ordenes_items')
      .insert(itemsParaInsertar);

    if (errorItems) {
      // Rollback manual: si fallan los items, borramos la orden huérfana
      await supabase.from('ordenes').delete().eq('id', orden.id);
      throw errorItems;
    }

    res.status(201).json({ ...orden, items: itemsConPrecio });
  } catch (err) {
    console.error('Error al crear orden:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /orders (admin ve todas, usuario ve las suyas)
export async function getOrdenes(req, res) {
  try {
    let query = supabase
      .from('ordenes')
      .select('*, users(id, nombre, email), ordenes_items(*, productos(nombre))')
      .order('created_at', { ascending: false });

    // Si NO es admin, solo ve sus propias órdenes
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

// GET /orders/:id
export async function getOrdenById(req, res) {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('ordenes')
      .select('*, users(id, nombre, email), ordenes_items(*, productos(nombre))')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    // Seguridad: un usuario normal no puede ver la orden de otro
    if (!req.user.es_admin && data.usuario_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error al obtener orden:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /orders/:id/estado (admin)
export async function updateEstadoOrden(req, res) {
  const { id } = req.params;
  const { estado } = req.body;

  if (!['pendiente', 'finalizado'].includes(estado)) {
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

    res.json(data);
  } catch (err) {
    console.error('Error al actualizar estado:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}