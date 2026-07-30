import { supabase } from '../config/supabase.js';

// GET /marcas
export async function getMarcas(req, res) {
  try {
    const { data, error } = await supabase
      .from('marcas')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener marcas:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /marcas (admin)
export async function createMarca(req, res) {
  const { nombre } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }

  try {
    const { data, error } = await supabase
      .from('marcas')
      .insert({ nombre })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error('Error al crear marca:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}