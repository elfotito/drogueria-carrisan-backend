import { supabase } from '../config/supabase.js';
import { aplicarDescuentosAProductos, aplicarDescuentoAProducto } from './descuentos.controller.js';
import { notificarDisponibles } from './alertasDisponibilidad.controller.js';

// Enriquece una lista de productos con rating_promedio y rating_total
// usando un único batch query a la tabla valoraciones.
export async function enriquecerConValoraciones(productos) {
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

// GET /products?search=&marca_id=&sort=&molecula=&linea=&laboratorio=&forma=&disponible=&sin_precio=&precio_min=&precio_max=&page=&limit=
// Sin `page` retorna un ARRAY plano (usado por Home, carruseles, buscadores, etc.)
// Con `page` retorna { productos, total, hasMore, page } (usado por Catalogo).
export async function getProductos(req, res) {
  const {
    search, marca_id, sort, molecula,
    linea, laboratorio, forma, disponible, sin_precio,
    precio_min, precio_max,
    page, limit
  } = req.query;

  // La paginación se activa solo cuando el frontend pide una `page` explícita
  // (ej. Catalogo). Quienes pasan solo `limit` (buscadores/autocomplete)
  // quieren un array plano y ya recortan con `.slice()` en el frontend.
  const usarPaginacion = page !== undefined;

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
        return usarPaginacion
          ? res.json({ productos: [], total: 0, hasMore: false, page: pageNum })
          : res.json([]);
      }

      const { data: relaciones, error: errorRelaciones } = await supabase
        .from('producto_moleculas')
        .select('producto_id')
        .in('molecula_id', moleculaIds);
      if (errorRelaciones) throw errorRelaciones;

      productoIdsPorMolecula = [...new Set((relaciones || []).map((r) => r.producto_id))];
      if (productoIdsPorMolecula.length === 0) {
        return usarPaginacion
          ? res.json({ productos: [], total: 0, hasMore: false, page: pageNum })
          : res.json([]);
      }
    }

    let query = supabase
      .from('productos')
      .select('*, marcas(id, nombre)', usarPaginacion ? { count: 'exact' } : undefined)
      .eq('activo', true);

    if (search) query = query.ilike('nombre_comercial', `%${search}%`);
    if (marca_id) query = query.eq('marca_id', marca_id);
    if (linea) query = query.eq('linea', linea);
    if (laboratorio) query = query.in('laboratorio', laboratorio.split(','));
    if (forma) query = query.in('forma', forma.split(','));
    if (disponible === 'true') query = query.eq('disponible', true);
    if (disponible === 'false') query = query.is('disponible', false);
    // Sin precio = "consultar precio": NULL o 0 (filtro de gestión de precios)
    if (sin_precio === 'true') query = query.or('precio_usd.is.null,precio_usd.eq.0');
    if (precio_min) query = query.gte('precio_usd', precio_min);
    if (precio_max) query = query.lte('precio_usd', precio_max);
    if (productoIdsPorMolecula) query = query.in('id', productoIdsPorMolecula);

    query = query.order(orden.column, { ascending: orden.ascending });

    if (usarPaginacion) {
      query = query.range(from, to);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    const productosConDescuento = await aplicarDescuentosAProductos(data);
    const productosConRating = usarPaginacion
      ? productosConDescuento
      : await enriquecerConValoraciones(productosConDescuento);

    if (!usarPaginacion) {
      return res.json(productosConRating);
    }

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

// GET /products/stats (admin) — estadísticas de catálogo para el dashboard:
// total, disponibles, sinPrecio, precioPromedio y conteo por línea.
export async function getProductosStats(req, res) {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('linea, precio_usd, disponible')
      .eq('activo', true);

    if (error) throw error;

    let total = 0;
    let disponibles = 0;
    let sinPrecio = 0;
    let sumaPrecios = 0;
    let conPrecio = 0;
    const cuentaLineas = {};

    for (const p of data || []) {
      total++;
      if (p.disponible) disponibles++;

      const precio = Number(p.precio_usd);
      if (!p.precio_usd || precio <= 0) {
        sinPrecio++;
      } else {
        sumaPrecios += precio;
        conPrecio++;
      }

      if (p.linea) cuentaLineas[p.linea] = (cuentaLineas[p.linea] || 0) + 1;
    }

    res.json({
      total,
      disponibles,
      sinPrecio,
      precioPromedio: conPrecio > 0 ? sumaPrecios / conPrecio : 0,
      lineas: Object.entries(cuentaLineas)
        .map(([linea, count]) => ({ linea, count }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (err) {
    console.error('Error al obtener estadísticas de productos:', err);
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

// POST /products/precios-bulk (admin) — actualización masiva de precios.
// body: { items: [{ id, precio_usd }] } (hasta 1000 por request).
// precio > 0  → publica (disponible=true) y avisa "avísame cuando llegue" si antes no tenía precio.
// precio <= 0 o null → despublica (precio_usd=NULL, disponible=false).
export async function preciosBulkUpdate(req, res) {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Se requieren items [{ id, precio_usd }]' });
  }
  if (items.length > 1000) {
    return res.status(400).json({ error: 'Máximo 1000 productos por request' });
  }

  const CHUNK = 500;
  let aplicados = 0;
  let publicados = 0;
  let despublicados = 0;
  let errores = 0;

  try {
    for (let i = 0; i < items.length; i += CHUNK) {
      const lote = items.slice(i, i + CHUNK);

      const { data: previos, error: errPrevios } = await supabase
        .from('productos')
        .select('id, precio_usd')
        .in('id', lote.map((it) => it.id));
      if (errPrevios) throw errPrevios;

      const precioAnteriorPorId = new Map((previos || []).map((p) => [p.id, p.precio_usd]));

      const { data: actualizados, error } = await supabase
        .from('productos')
        .upsert(
          lote.map((it) => {
            const precio = Number(it.precio_usd);
            const publicar = precio > 0;
            return {
              id: it.id,
              precio_usd: publicar ? precio : null,
              disponible: publicar,
              updated_at: new Date(),
            };
          }),
          { onConflict: 'id' }
        )
        .select('*');
      if (error) throw error;

      for (const fila of actualizados || []) {
        aplicados++;
        const teniaPrecio = precioAnteriorPorId.get(fila.id) && Number(precioAnteriorPorId.get(fila.id)) > 0;
        if (fila.precio_usd && Number(fila.precio_usd) > 0) {
          publicados++;
          // Cruzó de "sin precio" a "con precio": avisar a quien se suscribió.
          // No bloquea la respuesta del bulk.
          if (!teniaPrecio) {
            notificarDisponibles(fila).catch((err) =>
              console.error('Error al notificar disponibilidad:', err)
            );
          }
        } else {
          despublicados++;
        }
      }
    }

    res.json({
      aplicados,
      publicados,
      despublicados,
      errores,
      totalItems: items.length,
    });
  } catch (err) {
    console.error('Error en actualización masiva de precios:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
