import { supabase } from '../config/supabase.js';

// GET /prices → tasa actual
export async function getTasaCambio(req, res) {
  try {
    const { data, error } = await supabase
      .from('tasa_cambio')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'No hay tasa de cambio configurada' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error al obtener tasa:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /prices/tasa-cambio (admin)
export async function updateTasaCambio(req, res) {
  const { usd_a_ves } = req.body;

  if (!usd_a_ves || usd_a_ves <= 0) {
    return res.status(400).json({ error: 'usd_a_ves debe ser un número mayor a 0' });
  }

  try {
    // Insertamos una fila nueva en vez de actualizar (así queda historial de tasas)
    const { data, error } = await supabase
      .from('tasa_cambio')
      .insert({ usd_a_ves })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al actualizar tasa:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}