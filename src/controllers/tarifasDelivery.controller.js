import { supabase } from '../config/supabase.js';

// GET /delivery-tarifas — Todas las tarifas (admin)
export async function getTarifas(req, res) {
  try {
    const { data, error } = await supabase
      .from('tarifas_delivery')
      .select('*')
      .order('ciudad', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error al obtener tarifas:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /delivery-tarifas/activas — Solo activas (público, para checkout)
export async function getTarifasActivas(req, res) {
  try {
    const { data, error } = await supabase
      .from('tarifas_delivery')
      .select('ciudad, costo')
      .eq('activo', true)
      .order('ciudad', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error al obtener tarifas activas:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /delivery-tarifas — Crear tarifa
export async function crearTarifa(req, res) {
  try {
    const { ciudad, costo } = req.body;

    if (!ciudad || costo === undefined) {
      return res.status(400).json({ error: 'Ciudad y costo son requeridos' });
    }

    if (Number(costo) < 0) {
      return res.status(400).json({ error: 'El costo no puede ser negativo' });
    }

    const { data, error } = await supabase
      .from('tarifas_delivery')
      .insert({ ciudad: ciudad.trim(), costo: Number(costo) })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ya existe una tarifa para esa ciudad' });
      }
      throw error;
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Error al crear tarifa:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PUT /delivery-tarifas/:id — Actualizar tarifa
export async function actualizarTarifa(req, res) {
  try {
    const { id } = req.params;
    const { costo, activo } = req.body;

    const cambios = {};
    if (costo !== undefined) {
      if (Number(costo) < 0) {
        return res.status(400).json({ error: 'El costo no puede ser negativo' });
      }
      cambios.costo = Number(costo);
    }
    if (activo !== undefined) {
      cambios.activo = Boolean(activo);
    }

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ error: 'No hay cambios para guardar' });
    }

    const { data, error } = await supabase
      .from('tarifas_delivery')
      .update(cambios)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Tarifa no encontrada' });

    res.json(data);
  } catch (err) {
    console.error('Error al actualizar tarifa:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE /delivery-tarifas/:id — Eliminar tarifa
export async function eliminarTarifa(req, res) {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('tarifas_delivery')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ mensaje: 'Tarifa eliminada' });
  } catch (err) {
    console.error('Error al eliminar tarifa:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
