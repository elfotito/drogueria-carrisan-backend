import { supabase } from '../config/supabase.js';
import { aplicarDescuentosAProductos, aplicarDescuentoAProducto } from './descuentos.controller.js';

// Enriquece una lista de productos con rating_promedio y rating_total
// usando un único batch query a la tabla valoraciones.
async function enriquecerConValoraciones(productos) {
  if (!productos || productos.length === 0) return productos;

  const ids = productos.map((p) => p.id);
  const { data: valoraciones } = await supabase
    .from('valoraciones')
    .select('producto_id, estrellas')
    .in('producto_id', ids);

  const mapa = {};
  for (const v of valoraciones || []) {
    if (!mapa[v.producto_id]) mapa[v.producto_id] = { sum: 0, count: 0 };
    mapa[v.producto_id].sum += v.estrellas;
    mapa[v.producto_id].count++;
  }

  return productos.map((p) => {
    const r = mapa[p.id];
    return {
      ...p,
      rating_promedio: r ? Math.round((r.sum / r.count) * 10) / 10 : null,
      rating_total: r ? r.count : 0,
    };
  });
}

// GET /products?search=&marca_id=&sort=
export async function getProductos(req, res) {
  const { search, marca_id, sort } = req.query;

  // Mapa de valores permitidos de "sort" -> columna real + dirección
  // (whitelist explícita para no pasar strings arbitrarios directo a Supabase)
  const opcionesOrden = {
    nombre_asc: { column: 'nombre_comercial', ascending: true },
    nombre_desc: { column: 'nombre_comercial', ascending: false },
    precio_asc: { column: 'precio_usd', ascending: true },
    precio_desc: { column: 'precio_usd', ascending: false },
  };

  const orden = opcionesOrden[sort] || opcionesOrden.nombre_asc;

  try {
    let query = supabase
  .from('productos')
  .select('*, marcas(id, nombre)')
  .eq('activo', true)
  .eq('visible_catalogo', true)

    if (search) {
      query = query.ilike('nombre_comercial', `%${search}%`);
    }

    if (marca_id) {
      query = query.eq('marca_id', marca_id);
    }

    const { data, error } = await query.order(orden.column, {
      ascending: orden.ascending,
    });

    if (error) throw error;

    // 👇 único agregado: enriquece cada producto con precio_usd final (si tiene descuento vigente)
    const productosConDescuento = await aplicarDescuentosAProductos(data);

    // Enriquecer con rating_promedio y rating_total
    const productosConRating = await enriquecerConValoraciones(productosConDescuento);

    res.json(productosConRating);
  } catch (err) {
    console.error('Error al obtener productos:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /products/:id
export async function getProductoById(req, res) {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*, marcas(id, nombre)')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // 👇 único agregado
    const productoConDescuento = await aplicarDescuentoAProducto(data);

    // Enriquecer con rating_promedio y rating_total
    const [productoConRating] = await enriquecerConValoraciones([productoConDescuento]);

    res.json(productoConRating);
  } catch (err) {
    console.error('Error al obtener producto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /products (admin)
export async function createProducto(req, res) {
  const {
    nombre_comercial, descripcion, marca_id, precio_usd, foto_url,
    laboratorio, pais_origen, molecula, linea, forma, disponible
  } = req.body;

  if (!nombre_comercial || !precio_usd) {
    return res.status(400).json({ error: 'nombre_comercial y precio_usd son requeridos' });
  }

  try {
    const { data, error } = await supabase
      .from('productos')
      .insert({
        nombre_comercial,
        descripcion,
        marca_id,
        precio_usd,
        foto_url,
        laboratorio,
        pais_origen,
        molecula,
        linea,
        forma,
        disponible: disponible !== undefined ? disponible : true
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error('Error al crear producto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /products/:id (admin) — ya era genérico, sigue funcionando igual con los campos nuevos
export async function updateProducto(req, res) {
  const { id } = req.params;
  const cambios = req.body;

  try {
let precioAnterior = null;
    if (cambios.precio_usd !== undefined) {
      const { data: actual } = await supabase
        .from('productos')
        .select('precio_usd')
        .eq('id', id)
        .single();
      precioAnterior = actual?.precio_usd;
    }

    const { data, error } = await supabase
      .from('productos')
      .update({ ...cambios, updated_at: new Date() })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // 🆕 si pasó de "sin precio" (0 o null) a tener un precio real,
    // avisamos a quien se suscribió. No bloquea la respuesta al admin.
    const teniaPrecio = precioAnterior && Number(precioAnterior) > 0;
    const tieneAhora = data.precio_usd && Number(data.precio_usd) > 0;
    if (!teniaPrecio && tieneAhora) {
      notificarDisponibles(data).catch((err) =>
        console.error('Error al notificar disponibilidad:', err)
      );
    }

    res.json(data);
  } catch (err) {
    console.error('Error al actualizar producto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
