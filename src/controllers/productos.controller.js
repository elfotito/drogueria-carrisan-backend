// ---------------------------------------------------------------
// Cambios sobre tu productos.controller.js actual
// ---------------------------------------------------------------

// 1) Import, junto a los que ya tienes:
import { notificarDisponibles } from './alertasDisponibilidad.controller.js';

// 2) Dentro de updateProducto, ANTES de hacer el update, obtener el
//    precio anterior para poder comparar (necesitas saber si "estaba
//    en 0" antes de este cambio). Reemplaza tu updateProducto por:

export async function updateProducto(req, res) {
  const { id } = req.params;
  const cambios = req.body;

  try {
    // 🆕 leemos el precio actual ANTES de actualizar, solo si el
    // cambio incluye precio_usd (si no lo toca, no hace falta consultar)
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
