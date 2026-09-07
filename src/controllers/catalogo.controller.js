import { supabase } from '../config/supabase.js';

// =================================================================
// CATÁLOGO PÚBLICO DE CONSULTA (INHRR)
// Tablas: productos_catalogo + catalogo_moleculas (ver 014_productos_catalogo.sql).
// Solo lectura, sin auth. La lógica de filtrado/paginación vive en las RPC
// catalogo_listar / catalogo_producto / catalogo_metadata (plpgsql).
// =================================================================

const extraer = (data, nombre) =>
  Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && nombre in data[0]
    ? data[0][nombre]
    : data;

// GET /catalogo?q=&categoria=&forma=&laboratorio=&molecula=&page=&page_size=
export async function getCatalogo(req, res) {
  const { q, categoria, forma, laboratorio, molecula, page, page_size } = req.query;

  try {
    const { data, error } = await supabase.rpc('catalogo_listar', {
      p_q: q || null,
      p_categoria: categoria || null,
      p_forma: forma || null,
      p_laboratorio: laboratorio || null,
      p_molecula: molecula || null,
      p_page: parseInt(page || '1', 10) || 1,
      p_page_size: parseInt(page_size || '20', 10) || 20
    });

    if (error) throw error;
    res.json(extraer(data, 'catalogo_listar') || { rows: [], total: 0, page: 1, page_size: 20 });
  } catch (err) {
    console.error('Error al listar catálogo:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /catalogo/metadata
export async function getCatalogoMetadata(req, res) {
  try {
    const { data, error } = await supabase.rpc('catalogo_metadata');
    if (error) throw error;
    res.json(extraer(data, 'catalogo_metadata') || {});
  } catch (err) {
    console.error('Error al obtener metadata del catálogo:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /catalogo/:sku
export async function getProductoCatalogo(req, res) {
  const { sku } = req.params;

  try {
    const { data, error } = await supabase.rpc('catalogo_producto', { p_sku: sku });
    if (error) throw error;

    const producto = extraer(data, 'catalogo_producto');
    if (!producto || !producto.id) {
      return res.status(404).json({ error: 'Producto no encontrado en el catálogo' });
    }
    res.json(producto);
  } catch (err) {
    console.error('Error al obtener producto del catálogo:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}