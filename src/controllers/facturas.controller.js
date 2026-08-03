import { crearNotificacion } from './notificaciones.controller.js';

// GET /facturas?usuario_id= (admin)
export async function getFacturas(req, res) {
  const { usuario_id } = req.query;

  try {
    let query = supabase
      .from('facturas')
      .select('*, factura_ordenes(orden_id)')
      .order('created_at', { ascending: false });

    if (usuario_id) {
      query = query.eq('usuario_id', usuario_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener facturas:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /facturas (admin) - crear factura, opcionalmente agrupando órdenes
export async function createFactura(req, res) {
  const { usuario_id, numero_factura, monto_facturado, nota, orden_ids } = req.body;
  // orden_ids es opcional: [3, 4, 5] o [] si es una factura sin órdenes web (pedido telefónico)

  if (!usuario_id || !numero_factura || !monto_facturado) {
    return res.status(400).json({ error: 'usuario_id, numero_factura y monto_facturado son requeridos' });
  }

  try {
    // 1. Crear la factura
    const { data: factura, error: errorFactura } = await supabase
      .from('facturas')
      .insert({
        usuario_id,
        numero_factura,
        monto_facturado,
        nota,
        created_by: req.user.id
      })
      .select()
      .single();

    if (errorFactura) throw errorFactura;

    // 2. Si vienen órdenes, vincularlas (respetando que cada orden solo puede estar en 1 factura)
    if (orden_ids && orden_ids.length > 0) {
      const registros = orden_ids.map(orden_id => ({
        factura_id: factura.id,
        orden_id
      }));

      const { error: errorVinculo } = await supabase
        .from('factura_ordenes')
        .insert(registros);

      if (errorVinculo) {
        // Rollback: si alguna orden ya estaba facturada (viola UNIQUE), borramos la factura
        await supabase.from('facturas').delete().eq('id', factura.id);

        if (errorVinculo.code === '23505') { // código de PostgreSQL para violación de UNIQUE
          return res.status(409).json({ error: 'Una o más órdenes ya están facturadas' });
        }
        throw errorVinculo;
      }
    }

    await crearNotificacion(
      usuario_id,
      'factura_emitida',
      'Factura emitida',
      `Se emitió la factura #${numero_factura} por $${monto_facturado}`,
      null
    );

    res.status(201).json(factura);
  } catch (err) {
    console.error('Error al crear factura:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /facturas/:id (admin) - editar monto/nota/número
export async function updateFactura(req, res) {
  const { id } = req.params;
  const { numero_factura, monto_facturado, nota } = req.body;

  try {
    const cambios = {};
    if (numero_factura !== undefined) cambios.numero_factura = numero_factura;
    if (monto_facturado !== undefined) cambios.monto_facturado = monto_facturado;
    if (nota !== undefined) cambios.nota = nota;

    const { data, error } = await supabase
      .from('facturas')
      .update(cambios)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error al actualizar factura:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /ordenes-sin-facturar/:usuario_id (admin) - helper para armar una factura nueva
export async function getOrdenesSinFacturar(req, res) {
  const { usuario_id } = req.params;

  try {
    // Traemos las órdenes del usuario que NO aparecen en factura_ordenes
    const { data: ordenesFacturadas, error: errorFacturadas } = await supabase
      .from('factura_ordenes')
      .select('orden_id');

    if (errorFacturadas) throw errorFacturadas;

    const idsFacturados = ordenesFacturadas.map(o => o.orden_id);

    let query = supabase
      .from('ordenes')
      .select('*')
      .eq('usuario_id', usuario_id)
      .order('created_at', { ascending: false });

    if (idsFacturados.length > 0) {
      query = query.not('id', 'in', `(${idsFacturados.join(',')})`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener órdenes sin facturar:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}