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
const CATEGORIAS_SALIDA_INTERNA = ['Transferencia a banco', 'Préstamo a personal', 'Retiro del dueño', 'Otro interno'];

// ---------------------------------------------------------------
// GET /staff/tesoreria/movimientos?desde=&hasta=
// Lista movimientos del período: egresos/salidas de tabla + pagos como ingresos
// ---------------------------------------------------------------
export async function getMovimientos(req, res) {
  try {
    const { desde, hasta } = req.query;
    const fechaDesde = desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const fechaHasta = hasta || new Date().toISOString().slice(0, 10);

    // Egresos y salidas internas de la tabla movimientos_caja
    const { data: egresos, error: errEgresos } = await supabase
      .from('movimientos_caja')
      .select('id, staff_id, tipo, categoria, concepto, monto, fecha, tercero, created_at')
      .in('tipo', ['egreso', 'salida_interna'])
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .order('fecha', { ascending: false });

    if (errEgresos) throw errEgresos;

    // Ingresos derivados de pagos en el mismo período
    const { data: pagos, error: errPagos } = await supabase
      .from('pagos')
      .select('id, monto, created_at, usuario_id, users!pagos_usuario_id_fkey(nombre, email)')
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
        tercero: p.users?.nombre || null,
        cliente: p.users?.nombre || null,
      })),
      ...(egresos || []).map((e) => ({
        id: e.id,
        tipo: e.tipo,
        categoria: e.categoria,
        concepto: e.concepto,
        monto: Number(e.monto),
        fecha: e.fecha,
        staff_id: e.staff_id,
        tercero: e.tercero || null,
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
// Resumen consolidado: ingresos, egresos operativos, salidas internas,
// saldo, movimientos por día y totales por tercero
// ---------------------------------------------------------------
export async function getResumen(req, res) {
  try {
    const { desde, hasta } = req.query;
    const fechaDesde = desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const fechaHasta = hasta || new Date().toISOString().slice(0, 10);

    // Egresos y salidas internas del período
    const { data: movCaja, error: errMov } = await supabase
      .from('movimientos_caja')
      .select('monto, fecha, tipo, tercero')
      .in('tipo', ['egreso', 'salida_interna'])
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta);

    if (errMov) throw errMov;

    // Pagos del período (ingresos)
    const { data: pagos, error: errPagos } = await supabase
      .from('pagos')
      .select('monto, created_at, usuario_id, users!pagos_usuario_id_fkey(nombre)')
      .gte('created_at', `${fechaDesde}T00:00:00`)
      .lte('created_at', `${fechaHasta}T23:59:59`);

    if (errPagos) throw errPagos;

    const totalIngresos = (pagos || []).reduce((s, p) => s + Number(p.monto), 0);
    const totalEgresos = (movCaja || []).filter((m) => m.tipo === 'egreso').reduce((s, e) => s + Number(e.monto), 0);
    const totalSalidasInternas = (movCaja || []).filter((m) => m.tipo === 'salida_interna').reduce((s, e) => s + Number(e.monto), 0);

    // Agrupar por día
    const porDia = {};
    (pagos || []).forEach((p) => {
      const dia = p.created_at.slice(0, 10);
      if (!porDia[dia]) porDia[dia] = { fecha: dia, ingresos: 0, egresos: 0 };
      porDia[dia].ingresos += Number(p.monto);
    });
    (movCaja || []).forEach((m) => {
      if (!porDia[m.fecha]) porDia[m.fecha] = { fecha: m.fecha, ingresos: 0, egresos: 0 };
      porDia[m.fecha].egresos += Number(m.monto); // egresos operativos + salidas internas
    });

    const movimientosPorDia = Object.values(porDia)
      .sort((a, b) => (a.fecha > b.fecha ? -1 : 1))
      .map((d) => ({ ...d, saldo: d.ingresos - d.egresos }));

    // Totales por tercero
    const porTercero = {};
    (pagos || []).forEach((p) => {
      const nombre = p.users?.nombre || `Cliente #${p.usuario_id}`;
      if (!porTercero[nombre]) porTercero[nombre] = { tercero: nombre, tipo: 'Cliente', total: 0 };
      porTercero[nombre].total += Number(p.monto);
    });
    (movCaja || []).forEach((m) => {
      const nombre = m.tercero || (m.tipo === 'egreso' ? 'Egreso sin tercero' : 'Salida sin tercero');
      if (!porTercero[nombre]) porTercero[nombre] = { tercero: nombre, tipo: m.tipo === 'egreso' ? 'Proveedor' : 'Salida interna', total: 0 };
      porTercero[nombre].total -= Number(m.monto);
    });
    const porTerceroArr = Object.values(porTercero).sort((a, b) => (a.total < b.total ? -1 : 1));

    res.json({
      periodo: { desde: fechaDesde, hasta: fechaHasta },
      ingresos: totalIngresos,
      egresos: totalEgresos,
      salidas_internas: totalSalidasInternas,
      saldo: totalIngresos - totalEgresos - totalSalidasInternas,
      movimientos_por_dia: movimientosPorDia,
      por_tercero: porTerceroArr,
    });
  } catch (error) {
    console.error('Error getResumen:', error.message);
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
}

// ---------------------------------------------------------------
// POST /staff/tesoreria/egresos
// Crea un egreso operativo ('egreso') o una salida interna ('salida_interna')
// Body: { tipo?, categoria, concepto, monto, fecha?, tercero? }
// ---------------------------------------------------------------
export async function crearEgreso(req, res) {
  try {
    const { tipo = 'egreso', categoria, concepto, monto, fecha, tercero } = req.body;

    if (!['egreso', 'salida_interna'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo debe ser egreso o salida_interna' });
    }

    if (!categoria || !concepto || !monto) {
      return res.status(400).json({ error: 'categoria, concepto y monto son requeridos' });
    }

    const categoriasValidas = tipo === 'salida_interna' ? CATEGORIAS_SALIDA_INTERNA : CATEGORIAS_EGRESO;

    if (!categoriasValidas.includes(categoria)) {
      return res.status(400).json({ error: `categoria debe ser una de: ${categoriasValidas.join(', ')}` });
    }

    if (Number(monto) <= 0) {
      return res.status(400).json({ error: 'monto debe ser mayor a 0' });
    }

    if (tercero !== undefined && String(tercero).trim() !== '' && String(tercero).length > 200) {
      return res.status(400).json({ error: 'tercero no puede superar 200 caracteres' });
    }

    const { data, error } = await supabase
      .from('movimientos_caja')
      .insert({
        staff_id: req.staff.id,
        tipo,
        categoria,
        concepto,
        monto: Number(monto),
        fecha: fecha || new Date().toISOString().slice(0, 10),
        tercero: tercero && String(tercero).trim() !== '' ? String(tercero).trim() : null,
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