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

// GET /products?search=&marca_id=&sort=&linea=&laboratorio=&forma=&disponible=&precio_min=&precio_max=
//   → devuelve un ARRAY con todos los resultados (backward-compatible: así lo
//     consumen Home, Carrito, Ofertas, resultados de búsqueda, admin, etc.)
// GET /products?page=&limit=&... (iguales filtros)
//   → devuelve UN OBJETO paginado { productos, total, page, limit, hasMore }
//     para que el catálogo haga infinite scroll sin bajar todo.
export async function getProductos(req, res) {
  const {
    search,
    marca_id,
    sort,
    page,
    limit,
    linea,
    laboratorio,
    forma,
    disponible,
    precio_min,
    precio_max,
  } = req.query;

  // Mapa de valores permitidos de "sort" -> columna real + dirección
  // (whitelist explícita para no pasar strings arbitrarios directo a Supabase)
  const opcionesOrden = {
    nombre_asc: { column: 'nombre_comercial', ascending: true },
    nombre_desc: { column: 'nombre_comercial', ascending: false },
    precio_asc: { column: 'precio_usd', ascending: true },
    precio_desc: { column: 'precio_usd', ascending: false },
  };

  const orden = opcionesOrden[sort] || opcionesOrden.nombre_asc;

  // ¿Paginación activa? Solo si llega "page" (los demás consumidores que no
  // mandan page siguen recibiendo el array completo, como antes).
  const paginaPide = page !== undefined && page !== '';
  const paginaActual = Math.max(1, parseInt(page, 10) || 1);
  const limite = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
  const desde = (paginaActual - 1) * limite;
  const hasta = desde + limite - 1;

  try {
    let query = supabase
      .from('productos')
      .select('*, marcas(id, nombre)', { count: 'exact' })
      .eq('activo', true)
      .eq('visible_catalogo', true);

    if (search) {
      query = query.ilike('nombre_comercial', `%${search}%`);
    }

    if (marca_id) {
      query = query.eq('marca_id', marca_id);
    }

    if (linea) {
      query = query.eq('linea', linea);
    }

    // Multi-select por laboratorio/forma: vienen como "A,B,C"
    if (laboratorio) {
      query = query.in('laboratorio', laboratorio.split(','));
    }

    if (forma) {
      query = query.in('forma', forma.split(','));
    }

    if (disponible === 'true') {
      query = query.eq('disponible', true);
    }

    if (precio_min !== undefined && precio_min !== '') {
      query = query.gte('precio_usd', Number(precio_min));
    }

    if (precio_max !== undefined && precio_max !== '') {
      query = query.lte('precio_usd', Number(precio_max));
    }

    if (paginaPide) {
      query = query.order(orden.column, { ascending: orden.ascending }).range(desde, hasta);
    } else {
      query = query.order(orden.column, { ascending: orden.ascending });
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Enriquece con descuentos (precio_final) y ratings
    const productosConDescuento = await aplicarDescuentosAProductos(data || []);
    const productosConRating = await enriquecerConValoraciones(productosConDescuento);

    // Modo array (backward-compatible) vs. modo paginado (catálogo con infinite scroll)
    if (paginaPide) {
      res.json({
        productos: productosConRating,
        total: count ?? productosConRating.length,
        page: paginaActual,
        limit: limite,
        hasMore: count != null ? desde + productosConRating.length < count : productosConRating.length >= limite,
      });
    } else {
      res.json(productosConRating);
    }
  } catch (err) {
    console.error('Error al obtener productos:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /products/metadata
// Devuelve las listas únicas de laboratorios y formas + el total del catálogo,
// para llenar los filtros del sidebar sin tener que descargar todos los productos.
export async function getProductosMetadata(req, res) {
  try {
    const base = () =>
      supabase.from('productos').select('laboratorio, forma').eq('activo', true).eq('visible_catalogo', true);

    const [resLab, resForma, resCount] = await Promise.all([
      base().not('laboratorio', 'is', null),
      base().not('forma', 'is', null),
      supabase.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true).eq('visible_catalogo', true),
    ]);

    if (resLab.error || resForma.error || resCount.error) {
      throw resLab.error || resForma.error || resCount.error;
    }

    const laboratorios = Array.from(new Set((resLab.data || []).map((p) => p.laboratorio).filter(Boolean))).sort();
    const formas = Array.from(new Set((resForma.data || []).map((p) => p.forma).filter(Boolean))).sort();

    res.json({
      laboratorios,
      formas,
      totalCatalogo: resCount.count ?? 0,
    });
  } catch (err) {
    console.error('Error al obtener metadata de productos:', err);
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
