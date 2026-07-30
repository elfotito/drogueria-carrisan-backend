import { supabase } from '../config/supabase.js';

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
  // factura_ids es opcional: [7, 8] si este abono salda esas facturas específicas

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
    // Antes de borrar, revertimos el estado de las facturas que este pago había saldado
    const { data: vinculos } = await supabase
      .from('pago_facturas')
      .select('factura_id')
      .eq('pago_id', id);

    if (vinculos && vinculos.length > 0) {
      const facturaIds = vinculos.map(v => v.factura_id);
      await supabase.from('facturas').update({ estado: 'pendiente' }).in('id', facturaIds);
    }

    const { error } = await supabase.from('pagos').delete().eq('id', id);
    if (error) throw error;

    res.json({ message: 'Pago eliminado' });
  } catch (err) {
    console.error('Error al eliminar pago:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}