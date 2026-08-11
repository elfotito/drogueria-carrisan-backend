import { supabase } from '../config/supabase.js';

// GET /api/favoritos
// Obtiene todos los favoritos del usuario autenticado
export async function obtenerFavoritos(req, res) {
  try {
    const usuario_id = req.user.id;

    const { data, error } = await supabase
      .from('favoritos')
      .select(`
        id,
        created_at,
        productos (
          id,
          nombre_comercial,
          precio_usd,
          foto_url,
          disponible,
          laboratorio,
          marca_id,
          marcas (nombre)
        )
      `)
      .eq('usuario_id', usuario_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transformar para que sea más fácil de usar en el frontend
    const favoritos = data.map(fav => ({
      ...fav.productos,
      favorito_id: fav.id,
      favorito_creado: fav.created_at
    }));

    res.json({ favoritos });
  } catch (err) {
    console.error('Error al obtener favoritos:', err);
    res.status(500).json({ error: 'Error al obtener favoritos' });
  }
}

// POST /api/favoritos/toggle
// Agrega o quita un producto de favoritos
export async function toggleFavorito(req, res) {
  try {
    const usuario_id = req.user.id;
    const { producto_id } = req.body;

    if (!producto_id) {
      return res.status(400).json({ error: 'producto_id es requerido' });
    }

    // Verificar si ya existe
    const { data: existente } = await supabase
      .from('favoritos')
      .select('id')
      .eq('usuario_id', usuario_id)
      .eq('producto_id', producto_id)
      .single();

    if (existente) {
      // Si existe, lo eliminamos
      const { error } = await supabase
        .from('favoritos')
        .delete()
        .eq('id', existente.id);

      if (error) throw error;

      return res.json({ 
        accion: 'eliminado',
        mensaje: 'Producto quitado de favoritos' 
      });
    } else {
      // Si no existe, lo agregamos
      const { data, error } = await supabase
        .from('favoritos')
        .insert({
          usuario_id,
          producto_id
        })
        .select()
        .single();

      if (error) throw error;

      return res.json({ 
        accion: 'agregado',
        mensaje: 'Producto agregado a favoritos',
        favorito: data 
      });
    }
  } catch (err) {
    console.error('Error en toggle favorito:', err);
    res.status(500).json({ error: 'Error al actualizar favoritos' });
  }
}

// DELETE /api/favoritos/:productoId
// Elimina un favorito específico (opcional, el toggle ya lo hace)
export async function eliminarFavorito(req, res) {
  try {
    const usuario_id = req.user.id;
    const { productoId } = req.params;

    const { error } = await supabase
      .from('favoritos')
      .delete()
      .eq('usuario_id', usuario_id)
      .eq('producto_id', productoId);

    if (error) throw error;

    res.json({ mensaje: 'Favorito eliminado' });
  } catch (err) {
    console.error('Error al eliminar favorito:', err);
    res.status(500).json({ error: 'Error al eliminar favorito' });
  }
}

// GET /api/favoritos/check/:productoId
// Verifica si un producto está en favoritos (útil para el corazón en ProductCard)
export async function checkFavorito(req, res) {
  try {
    const usuario_id = req.user.id;
    const { productoId } = req.params;

    const { data } = await supabase
      .from('favoritos')
      .select('id')
      .eq('usuario_id', usuario_id)
      .eq('producto_id', productoId)
      .single();

    res.json({ esFavorito: !!data });
  } catch (err) {
    console.error('Error al verificar favorito:', err);
    res.status(500).json({ error: 'Error al verificar favorito' });
  }
}