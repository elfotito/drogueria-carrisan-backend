import { supabase } from '../config/supabase.js';

// Campos permitidos, para evitar que te pasen cualquier cosa por query string
const CAMPOS_PERMITIDOS = ['laboratorio', 'molecula', 'linea', 'forma'];

// GET /products/valores-distintos?campo=laboratorio
export async function getValoresDistintos(req, res) {
  try {
    const { campo } = req.query;

    if (!CAMPOS_PERMITIDOS.includes(campo)) {
      return res.status(400).json({
        error: `campo inválido, debe ser uno de: ${CAMPOS_PERMITIDOS.join(', ')}`,
      });
    }

    const { data, error } = await supabase
      .from('productos')
      .select(campo)
      .not(campo, 'is', null);

    if (error) throw error;

    // dedupe + orden alfabético, filtrando strings vacíos
    const valoresUnicos = [...new Set(data.map(row => row[campo]).filter(v => v && v.trim()))]
      .sort((a, b) => a.localeCompare(b));

    res.json(valoresUnicos);
  } catch (err) {
    console.error('Error obteniendo valores distintos:', err);
    res.status(500).json({ error: 'Error al obtener valores distintos' });
  }
}
