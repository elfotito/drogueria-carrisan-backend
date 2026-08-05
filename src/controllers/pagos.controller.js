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
export async function createPago(req, res) {
  const { usuario_id, monto, tipo, detalle, factura_ids } = req.body;

  if (!usuario_id || !monto) {
    return res.status(400).json({ error: 'usuario_id y monto son requeridos' });
  }

  try {
    // 1. Crear el pago
    const { data: pago, error: errorPago } = await supabase
      .from('pagos')
      .insert({
        usuario_id,
        monto,
        tipo: tipo || 'abono',
        detalle,
        created_by: req.user.id
      })
      .select()
      .single();

    if (errorPago) throw errorPago;

    // 2. Si el admin marcó facturas específicas como saldadas con este pago
    if (factura_ids && factura_ids.length > 0) {
      const registros = factura_ids.map(factura_id => ({
        pago_id: pago.id,
        factura_id
      }));

      const { error: errorVinculo } = await supabase
        .from('pago_facturas')
        .insert(registros);

      if (errorVinculo) {
        await supabase.from('pagos').delete().eq('id', pago.id);
        throw errorVinculo;
      }

      // 3. Marcar esas facturas como 'pagada'
      const { error: errorEstado } = await supabase
        .from('facturas')
        .update({ estado: 'pagada' })
        .in('id', factura_ids);

      if (errorEstado) throw errorEstado;
    }

    // 4. Notificar al cliente
    const facturasTexto = factura_ids && factura_ids.length > 0
      ? ` (Facturas: ${factura_ids.join(', ')})`
      : '';

    await crearNotificacion(
      usuario_id,
      'pago_registrado',
      'Pago registrado',
      `Se registró un abono por $${monto}${facturasTexto}`,
      null
    );

    res.status(201).json(pago);
  } catch (err) {
    console.error('Error al crear pago:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE /pagos/:id (admin) - por si se registra mal un abono
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