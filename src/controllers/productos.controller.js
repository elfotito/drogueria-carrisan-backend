import { supabase } from '../config/supabase.js';

// GET /products?search=&marca_id=
export async function getProductos(req, res) {
  const { search, marca_id } = req.query;

  try {
    let query = supabase
      .from('productos')
      .select('*, marcas(id, nombre)')
      .eq('activo', true);

    if (search) {
      query = query.ilike('nombre', `%${search}%`);
    }

    if (marca_id) {
      query = query.eq('marca_id', marca_id);
    }

    const { data, error } = await query.order('nombre', { ascending: true });

    if (error) throw error;

    res.json(data);
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

    res.json(data);
  } catch (err) {
    console.error('Error al obtener producto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /products (admin)
export async function createProducto(req, res) {
  const { nombre, descripcion, marca_id, precio_usd, foto_url } = req.body;

  if (!nombre || !precio_usd) {
    return res.status(400).json({ error: 'Nombre y precio_usd son requeridos' });
  }

  try {
    const { data, error } = await supabase
      .from('productos')
      .insert({ nombre, descripcion, marca_id, precio_usd, foto_url })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error('Error al crear producto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /products/:id (admin)
export async function updateProducto(req, res) {
  const { id } = req.params;
  const cambios = req.body; // ej: { precio_usd: 15.50 } o { activo: false }

  try {
    const { data, error } = await supabase
      .from('productos')
      .update({ ...cambios, updated_at: new Date() })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error al actualizar producto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}