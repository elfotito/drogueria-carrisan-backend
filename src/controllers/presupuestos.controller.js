import { supabase } from '../config/supabase.js';
import { aplicarDescuentoAProducto } from './descuentos.controller.js';

const HORAS_VIGENCIA = 24;

// ---------------------------------------------------------------
// Helper: dado un arreglo [{ producto_id, cantidad }], resuelve
// precio final (con descuento vigente aplicado) y disponibilidad
// actual de cada producto. Ignora silenciosamente productos que
// ya no existen (quedan fuera del nuevo presupuesto).
// ---------------------------------------------------------------
async function resolverItems(itemsSolicitados) {
  const ids = itemsSolicitados.map((i) => i.producto_id);

  const { data: productos, error } = await supabase
    .from('productos')
    .select('id, nombre_comercial, foto_url, precio_usd, disponible')
    .in('id', ids);

  if (error) throw error;

  const mapaProductos = new Map(productos.map((p) => [p.id, p]));
  const itemsResueltos = [];

  for (const solicitado of itemsSolicitados) {
    const producto = mapaProductos.get(solicitado.producto_id);
    if (!producto) continue; // producto eliminado: se excluye del presupuesto

    const cantidad = Number(solicitado.cantidad) || 1;
    const productoConDescuento = await aplicarDescuentoAProducto(producto);

    itemsResueltos.push({
      producto_id: producto.id,
      cantidad,
      precio_unitario_snapshot: productoConDescuento.precio_usd ?? 0,
    });
  }

  return itemsResueltos;
}

// ---------------------------------------------------------------
// POST /presupuestos
// Body: { items: [{ producto_id, cantidad }] }
// ---------------------------------------------------------------
export async function crearPresupuesto(req, res) {
  const { items } = req.body;
  const usuario_id = req.user.id;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debes incluir al menos un producto' });
  }

  try {
    const itemsResueltos = await resolverItems(items);

    if (itemsResueltos.length === 0) {
      return res.status(400).json({ error: 'Ninguno de los productos indicados existe' });
    }

    const total = itemsResueltos.reduce(
      (acc, i) => acc + i.precio_unitario_snapshot * i.cantidad,
      0
    );

    const ahora = new Date();
    const expiracion = new Date(ahora.getTime() + HORAS_VIGENCIA * 60 * 60 * 1000);

    const { data: presupuesto, error: errorPresupuesto } = await supabase
      .from('presupuestos')
      .insert({
        usuario_id,
        estado: 'vigente',
        fecha_creacion: ahora.toISOString(),
        fecha_expiracion: expiracion.toISOString(),
        total_usd: Number(total.toFixed(2)),
      })
      .select()
      .single();

    if (errorPresupuesto) throw errorPresupuesto;

    const filasItems = itemsResueltos.map((i) => ({
      presupuesto_id: presupuesto.id,
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      precio_unitario_snapshot: i.precio_unitario_snapshot,
    }));

    const { error: errorItems } = await supabase.from('presupuesto_items').insert(filasItems);
    if (errorItems) throw errorItems;

    res.status(201).json(presupuesto);
  } catch (err) {
    console.error('Error al crear presupuesto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ---------------------------------------------------------------
// GET /presupuestos/mios
// Historial de presupuestos del usuario (listado recurrente).
// ---------------------------------------------------------------
export async function getMisPresupuestos(req, res) {
  try {
    const { data, error } = await supabase
      .from('presupuestos')
      .select('id, numero, estado, fecha_creacion, fecha_expiracion, total_usd')
      .eq('usuario_id', req.user.id)
      .order('fecha_creacion', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener presupuestos:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ---------------------------------------------------------------
// GET /presupuestos/:id
// Detalle con items, disponibilidad en vivo y comparación de
// precio contra el presupuesto anterior (si existe uno vinculado).
// ---------------------------------------------------------------
export async function getPresupuestoById(req, res) {
  const { id } = req.params;

  try {
    const { data: presupuesto, error: errorPresupuesto } = await supabase
      .from('presupuestos')
      .select('*')
      .eq('id', id)
      .eq('usuario_id', req.user.id)
      .single();

    if (errorPresupuesto || !presupuesto) {
      return res.status(404).json({ error: 'Presupuesto no encontrado' });
    }

    const { data: items, error: errorItems } = await supabase
      .from('presupuesto_items')
      .select('id, producto_id, cantidad, precio_unitario_snapshot, productos(id, nombre_comercial, foto_url, disponible)')
      .eq('presupuesto_id', id);

    if (errorItems) throw errorItems;

    // Mapa de precios del presupuesto anterior (si existe) para calcular
    // el indicador de subida/bajada por línea.
    let preciosAnteriores = new Map();
    if (presupuesto.presupuesto_anterior_id) {
      const { data: itemsAnteriores } = await supabase
        .from('presupuesto_items')
        .select('producto_id, precio_unitario_snapshot')
        .eq('presupuesto_id', presupuesto.presupuesto_anterior_id);

      preciosAnteriores = new Map(
        (itemsAnteriores || []).map((i) => [i.producto_id, i.precio_unitario_snapshot])
      );
    }

    const ahora = new Date();
    const vencido = new Date(presupuesto.fecha_expiracion) <= ahora;

    const itemsConEstado = items.map((item) => {
      const disponible = item.productos ? item.productos.disponible : false;
      const precioAnterior = preciosAnteriores.get(item.producto_id);

      let cambio_precio = null; // 'subio' | 'bajo' | 'igual' | null (sin comparación disponible)
      if (precioAnterior !== undefined) {
        if (item.precio_unitario_snapshot > precioAnterior) cambio_precio = 'subio';
        else if (item.precio_unitario_snapshot < precioAnterior) cambio_precio = 'bajo';
        else cambio_precio = 'igual';
      }

      return {
        id: item.id,
        producto_id: item.producto_id,
        nombre_comercial: item.productos?.nombre_comercial ?? 'Producto no disponible',
        foto_url: item.productos?.foto_url ?? null,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario_snapshot,
        subtotal: Number((item.precio_unitario_snapshot * item.cantidad).toFixed(2)),
        disponible,
        cambio_precio,
      };
    });

    res.json({
      ...presupuesto,
      vencido,
      items: itemsConEstado,
    });
  } catch (err) {
    console.error('Error al obtener presupuesto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ---------------------------------------------------------------
// POST /presupuestos/:id/recotizar
// Toma producto_id + cantidad del presupuesto (vencido o no) y
// crea uno nuevo con precios/disponibilidad actuales, 24h nuevas,
// enlazado al anterior para poder comparar precios.
// ---------------------------------------------------------------
export async function recotizarPresupuesto(req, res) {
  const { id } = req.params;
  const usuario_id = req.user.id;

  try {
    const { data: anterior, error: errorAnterior } = await supabase
      .from('presupuestos')
      .select('id')
      .eq('id', id)
      .eq('usuario_id', usuario_id)
      .single();

    if (errorAnterior || !anterior) {
      return res.status(404).json({ error: 'Presupuesto no encontrado' });
    }

    const { data: itemsAnteriores, error: errorItems } = await supabase
      .from('presupuesto_items')
      .select('producto_id, cantidad')
      .eq('presupuesto_id', id);

    if (errorItems) throw errorItems;

    if (!itemsAnteriores || itemsAnteriores.length === 0) {
      return res.status(400).json({ error: 'El presupuesto no tiene productos para recotizar' });
    }

    const itemsResueltos = await resolverItems(itemsAnteriores);

    if (itemsResueltos.length === 0) {
      return res.status(400).json({ error: 'Ninguno de los productos de este presupuesto existe ya' });
    }

    const total = itemsResueltos.reduce(
      (acc, i) => acc + i.precio_unitario_snapshot * i.cantidad,
      0
    );

    const ahora = new Date();
    const expiracion = new Date(ahora.getTime() + HORAS_VIGENCIA * 60 * 60 * 1000);

    const { data: nuevo, error: errorNuevo } = await supabase
      .from('presupuestos')
      .insert({
        usuario_id,
        estado: 'vigente',
        fecha_creacion: ahora.toISOString(),
        fecha_expiracion: expiracion.toISOString(),
        total_usd: Number(total.toFixed(2)),
        presupuesto_anterior_id: id,
      })
      .select()
      .single();

    if (errorNuevo) throw errorNuevo;

    const filasItems = itemsResueltos.map((i) => ({
      presupuesto_id: nuevo.id,
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      precio_unitario_snapshot: i.precio_unitario_snapshot,
    }));

    const { error: errorInsertItems } = await supabase.from('presupuesto_items').insert(filasItems);
    if (errorInsertItems) throw errorInsertItems;

    res.status(201).json(nuevo);
  } catch (err) {
    console.error('Error al recotizar presupuesto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}