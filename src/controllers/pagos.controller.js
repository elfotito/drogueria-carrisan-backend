import { supabase } from '../config/supabase.js';
import { crearNotificacion } from './notificaciones.controller.js';

// GET /pagos?usuario_id= (admin)
export async function getPagos(req, res) {
  const { usuario_id } = req.query;

  try {
    let query = supabase
      .from('pagos')
      .select('*, pago_facturas(factura_id)')
      .order('created_at', { ascending: false });

    if (usuario_id) {
      query = query.eq('usuario_id', usuario_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener pagos:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /pagos (admin) - registrar un abono, opcionalmente saldando facturas
export async function deletePago(req, res) {
  const { id } = req.params;

  try {
    // 1. Obtener datos del pago ANTES de borrar
    const { data: pago, error: errorPago } = await supabase
      .from('pagos')
      .select('usuario_id, monto')
      .eq('id', id)
      .single();

    if (errorPago || !pago) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    // 2. Revertir facturas
    const { data: vinculos } = await supabase
      .from('pago_facturas')
      .select('factura_id')
      .eq('pago_id', id);

    if (vinculos && vinculos.length > 0) {
      const facturaIds = vinculos.map(v => v.factura_id);
      await supabase.from('facturas').update({ estado: 'pendiente' }).in('id', facturaIds);
    }

    // 3. Borrar pago
    const { error } = await supabase.from('pagos').delete().eq('id', id);
    if (error) throw error;

    // 4. Notificar
    await crearNotificacion(
      pago.usuario_id,
      'pago_registrado',
      'Pago anulado',
      `Se anuló un abono por $${pago.monto}. Contacta a Droguería Carrirán si crees que es un error.`,
      null
    );

    res.json({ message: 'Pago eliminado' });
  } catch (err) {
    console.error('Error al eliminar pago:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}