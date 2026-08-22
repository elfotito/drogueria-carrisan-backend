import { supabase } from '../config/supabase.js';

// ---------------------------------------------------------
// Valoraciones de producto: 1 por usuario por producto, sin edición
// posterior. Promedio/total se calculan al vuelo (sin columna
// cacheada) — para el volumen que maneja esta tienda no hace falta
// optimizar eso todavía.
// ---------------------------------------------------------

// GET /products/:id/valoraciones — lista pública + promedio
export async function getValoraciones(req, res) {
  const { id: producto_id } = req.params;

  try {
    const { data, error } = await supabase
      .from('valoraciones')
      .select('id, estrellas, comentario, created_at, users(nombre)')
      .eq('producto_id', producto_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const total = data.length;
    const promedio = total > 0
      ? data.reduce((sum, v) => sum + v.estrellas, 0) / total
      : 0;

    res.json({
      promedio: Math.round(promedio * 10) / 10,
      total,
      valoraciones: data,
    });
  } catch (err) {
    console.error('Error al obtener valoraciones:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /products/:id/valoraciones/mia — ¿el usuario actual ya calificó?
export async function getMiValoracion(req, res) {
  const { id: producto_id } = req.params;

  try {
    const { data, error } = await supabase
      .from('valoraciones')
      .select('id, estrellas, comentario')
      .eq('producto_id', producto_id)
      .eq('usuario_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    res.json(data || null);
  } catch (err) {
    console.error('Error al consultar valoración propia:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /products/:id/valoraciones  { estrellas, comentario }
export async function crearValoracion(req, res) {
  const { id: producto_id } = req.params;
  const { estrellas, comentario } = req.body;
  const usuario_id = req.user.id;

  const estrellasNum = Number(estrellas);
  if (!Number.isInteger(estrellasNum) || estrellasNum < 1 || estrellasNum > 5) {
    return res.status(400).json({ error: 'Las estrellas deben ser un número entre 1 y 5' });
  }

  try {
    const { data: existente, error: errorBusqueda } = await supabase
      .from('valoraciones')
      .select('id')
      .eq('producto_id', producto_id)
      .eq('usuario_id', usuario_id)
      .maybeSingle();

    if (errorBusqueda) throw errorBusqueda;
    if (existente) {
      return res.status(409).json({ error: 'Ya dejaste una valoración para este producto' });
    }

    const { data, error } = await supabase
      .from('valoraciones')
      .insert({
        producto_id,
        usuario_id,
        estrellas: estrellasNum,
        comentario: comentario?.trim() || null,
      })
      .select('id, estrellas, comentario, created_at')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error al crear valoración:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
