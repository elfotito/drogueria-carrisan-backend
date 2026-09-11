// tesoreria.controller.js
import { supabase } from '../config/supabase.js';

// =====================================================================
// Tesorería — Movimientos de caja (staff)
//
// Endpoints bajo /staff/tesoreria/* (verifyStaffJWT + checkRolStaff).
// Roles: contabilidad, administrador, director, admin.
//
// Ingresos: derivados de 'pagos' (read-only, no inserts).
// Egresos: registrados manualmente en 'movimientos_caja'.
// =====================================================================

const CATEGORIAS_EGRESO = ['Proveedores', 'Nómina', 'Servicios', 'Mantenimiento', 'Impuestos', 'Otro'];

// ---------------------------------------------------------------
// GET /staff/tesoreria/movimientos?desde=&hasta=
// Lista movimientos del período: egresos de tabla + pagos como ingresos
// ---------------------------------------------------------------
export async function getMovimientos(req, res) {
  try {
    const { desde, hasta } = req.query;
    const fechaDesde = desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const fechaHasta = hasta || new Date().toISOString().slice(0, 10);

    // Egresos de la tabla movimientos_caja
    const { data: egresos, error: errEgresos } = await supabase
      .from('movimientos_caja')
      .select('id, staff_id, categoria, concepto, monto, fecha, created_at')
      .eq('tipo', 'egreso')
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .order('fecha', { ascending: false });

    if (errEgresos) throw errEgresos;

    // Ingresos derivados de pagos en el mismo período
    const { data: pagos, error: errPagos } = await supabase
      .from('pagos')
      .select('id, monto, created_at')
      .gte('created_at', `${fechaDesde}T00:00:00`)
      .lte('created_at', `${fechaHasta}T23:59:59`)
      .order('created_at', { ascending: false });

    if (errPagos) throw errPagos;

    const movimientos = [
      ...(pagos || []).map((p) => ({
        id: `pago-${p.id}`,
        tipo: 'ingreso',
        categoria: 'Pagos',
        concepto: `Pago recibido`,
        monto: Number(p.monto),
        fecha: p.created_at.slice(0, 10),
        fuente: 'pagos',
      })),
      ...(egresos || []).map((e) => ({
        id: e.id,
        tipo: 'egreso',
        categoria: e.categoria,
        concepto: e.concepto,
        monto: Number(e.monto),
        fecha: e.fecha,
        staff_id: e.staff_id,
        fuente: 'movimientos_caja',
      })),
    ].sort((a, b) => (a.fecha > b.fecha ? -1 : a.fecha < b.fecha ? 1 : 0));

    res.json(movimientos);
  } catch (error) {
    console.error('Error getMovimientos:', error.message);
    res.status(500).json({ error: 'Error al obtener movimientos' });
  }
}

// ---------------------------------------------------------------
// GET /staff/tesoreria/resumen?desde=&hasta=
// Resumen consolidado: ingresos, egresos, saldo, movimientos por día
// ---------------------------------------------------------------
export async function getResumen(req, res) {
  try {
    const { desde, hasta } = req.query;
    const fechaDesde = desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const fechaHasta = hasta || new Date().toISOString().slice(0, 10);

    // Egresos del período
    const { data: egresos, error: errEgresos } = await supabase
      .from('movimientos_caja')
      .select('monto, fecha')
      .eq('tipo', 'egreso')
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta);

    if (errEgresos) throw errEgresos;

    // Pagos del período (ingresos)
    const { data: pagos, error: errPagos } = await supabase
      .from('pagos')
      .select('monto, created_at')
      .gte('created_at', `${fechaDesde}T00:00:00`)
      .lte('created_at', `${fechaHasta}T23:59:59`);

    if (errPagos) throw errPagos;

    const totalIngresos = (pagos || []).reduce((s, p) => s + Number(p.monto), 0);
    const totalEgresos = (egresos || []).reduce((s, e) => s + Number(e.monto), 0);

    // Agrupar por día
    const porDia = {};
    (pagos || []).forEach((p) => {
      const dia = p.created_at.slice(0, 10);
      if (!porDia[dia]) porDia[dia] = { fecha: dia, ingresos: 0, egresos: 0 };
      porDia[dia].ingresos += Number(p.monto);
    });
    (egresos || []).forEach((e) => {
      if (!porDia[e.fecha]) porDia[e.fecha] = { fecha: e.fecha, ingresos: 0, egresos: 0 };
      porDia[e.fecha].egresos += Number(e.monto);
    });

    const movimientosPorDia = Object.values(porDia)
      .sort((a, b) => (a.fecha > b.fecha ? -1 : 1))
      .map((d) => ({ ...d, saldo: d.ingresos - d.egresos }));

    res.json({
      periodo: { desde: fechaDesde, hasta: fechaHasta },
      ingresos: totalIngresos,
      egresos: totalEgresos,
      saldo: totalIngresos - totalEgresos,
      movimientos_por_dia: movimientosPorDia,
    });
  } catch (error) {
    console.error('Error getResumen:', error.message);
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
}

// ---------------------------------------------------------------
// POST /staff/tesoreria/egresos
// Crea un egreso manual
// Body: { categoria, concepto, monto, fecha? }
// ---------------------------------------------------------------
export async function crearEgreso(req, res) {
  try {
    const { categoria, concepto, monto, fecha } = req.body;

    if (!categoria || !concepto || !monto) {
      return res.status(400).json({ error: 'categoria, concepto y monto son requeridos' });
    }

    if (!CATEGORIAS_EGRESO.includes(categoria)) {
      return res.status(400).json({ error: `categoria debe ser una de: ${CATEGORIAS_EGRESO.join(', ')}` });
    }

    if (Number(monto) <= 0) {
      return res.status(400).json({ error: 'monto debe ser mayor a 0' });
    }

    const { data, error } = await supabase
      .from('movimientos_caja')
      .insert({
        staff_id: req.staff.id,
        tipo: 'egreso',
        categoria,
        concepto,
        monto: Number(monto),
        fecha: fecha || new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error('Error crearEgreso:', error.message);
    res.status(500).json({ error: 'Error al crear egreso' });
  }
}

// ---------------------------------------------------------------
// DELETE /staff/tesoreria/egresos/:id
// Elimina un egreso (solo propio o admin+)
// ---------------------------------------------------------------
export async function eliminarEgreso(req, res) {
  try {
    const { id } = req.params;
    const { data: egreso, error: errFetch } = await supabase
      .from('movimientos_caja')
      .select('staff_id')
      .eq('id', id)
      .single();

    if (errFetch || !egreso) {
      return res.status(404).json({ error: 'Egreso no encontrado' });
    }

    const esPropio = egreso.staff_id === req.staff.id;
    const esAdmin = ['administrador', 'director', 'admin'].includes(req.staff.rol);

    if (!esPropio && !esAdmin) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este egreso' });
    }

    const { error } = await supabase.from('movimientos_caja').delete().eq('id', id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (error) {
    console.error('Error eliminarEgreso:', error.message);
    res.status(500).json({ error: 'Error al eliminar egreso' });
  }
}