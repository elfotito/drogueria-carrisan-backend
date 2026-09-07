import { supabase } from '../config/supabase.js';

// GET /staff/direcciones — direcciones de envío de TODOS los clientes
// (activas) con la info del cliente dueño, para planificar despachos y
// consultar a nombre de quién está registrada cada dirección. Filtros
// opcionales: ?tipo=delivery|envio_nacional y ?buscar=<texto> (nombre del
// cliente, email, dirección o ciudad).
export async function getDireccionesStaff(req, res) {
  const { tipo, buscar } = req.query;

  try {
    let query = supabase
      .from('direcciones_envio')
      .select('*, users(id, nombre, email, telefono, rif_cedula)')
      .eq('activo', true);

    if (tipo && (tipo === 'delivery' || tipo === 'envio_nacional')) {
      query = query.eq('tipo_direccion', tipo);
    }

    if (buscar && buscar.trim().length >= 2) {
      const texto = buscar.trim();
      query = query.or(
        `users.nombre.ilike.%${texto}%,users.email.ilike.%${texto}%,direccion.ilike.%${texto}%,ciudad.ilike.%${texto}%`
      );
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error('Error al obtener direcciones (staff):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}