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

// GET /products?search=&marca_id=&sort=&molecula=&linea=&laboratorio=&forma=&disponible=&precio_min=&precio_max=&page=&limit=
export async function getProductos(req, res) {
  const {
    search, marca_id, sort, molecula,
    linea, laboratorio, forma, disponible,
    precio_min, precio_max,
    page = 1, limit = 24
  } = req.query;

  const opcionesOrden = {
    nombre_asc: { column: 'nombre_comercial', ascending: true },
    nombre_desc: { column: 'nombre_comercial', ascending: false },
    precio_asc: { column: 'precio_usd', ascending: true },
    precio_desc: { column: 'precio_usd', ascending: false },
  };
  const orden = opcionesOrden[sort] || opcionesOrden.nombre_asc;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 24);
  const from = (pageNum - 1) * limitNum;
  const to = from + limitNum - 1;

  try {
    // Filtro por principio activo (molécula normalizada). Se resuelve aparte
    // porque depende de la RPC buscar_moleculas + la tabla puente producto_moleculas,
    // antes de poder filtrar la tabla productos por id.
    let productoIdsPorMolecula = null;
    if (molecula) {
      const { data: moleculasMatch, error: errorBuscar } = await supabase.rpc('buscar_moleculas', { termino: molecula });
      if (errorBuscar) throw errorBuscar;

      const moleculaIds = (moleculasMatch || []).map((m) => m.id);
      if (moleculaIds.length === 0) {
        return res.json({ productos: [], total: 0, hasMore: false, page: pageNum });
      }

      const { data: relaciones, error: errorRelaciones } = await supabase
        .from('producto_moleculas')
        .select('producto_id')
        .in('molecula_id', moleculaIds);
      if (errorRelaciones) throw errorRelaciones;

      productoIdsPorMolecula = [...new Set((relaciones || []).map((r) => r.producto_id))];
      if (productoIdsPorMolecula.length === 0) {
        return res.json({ productos: [], total: 0, hasMore: false, page: pageNum });
      }
    }

    let query = supabase
      .from('productos')
      .select('*, marcas(id, nombre)', { count: 'exact' })
      .eq('activo', true);

    if (search) query = query.ilike('nombre_comercial', `%${search}%`);
    if (marca_id) query = query.eq('marca_id', marca_id);
    if (linea) query = query.eq('linea', linea);
    if (laboratorio) query = query.in('laboratorio', laboratorio.split(','));
    if (forma) query = query.in('forma', forma.split(','));
    if (disponible === 'true') query = query.eq('disponible', true);
    if (precio_min) query = query.gte('precio_usd', precio_min);
    if (precio_max) query = query.lte('precio_usd', precio_max);
    if (productoIdsPorMolecula) query = query.in('id', productoIdsPorMolecula);

    const { data, error, count } = await query
      .order(orden.column, { ascending: orden.ascending })
      .range(from, to);

    if (error) throw error;

    const productosConDescuento = await aplicarDescuentosAProductos(data);

    res.json({
      productos: productosConDescuento,
      total: count ?? productosConDescuento.length,
      hasMore: (count ?? 0) > to + 1,
      page: pageNum,
    });
  } catch (err) {
    console.error('Error al obtener productos:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /products/metadata — valores distintos de laboratorio/forma para poblar filtros
export async function getProductosMetadata(req, res) {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('laboratorio, forma')
      .eq('activo', true);

    if (error) throw error;

    const laboratorios = [...new Set((data || []).map((p) => p.laboratorio).filter(Boolean))].sort();
    const formas = [...new Set((data || []).map((p) => p.forma).filter(Boolean))].sort();

    res.json({ laboratorios, formas });
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
