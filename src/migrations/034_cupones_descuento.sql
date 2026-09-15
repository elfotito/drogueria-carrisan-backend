-- 034_cupones_descuento.sql
-- Cupones/giftcards de descuento sobre el total del pedido.
-- Un solo uso global: se consumen atomicamente al crear la orden que los aplica.
-- Aplicar A MANO en Supabase SQL Editor.
create table if not exists public.cupones_descuento (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  tipo text not null check (tipo in ('porcentaje', 'monto')),
  valor numeric not null check (valor > 0),
  expira_en timestamptz null,
  activo boolean not null default true,
  usado boolean not null default false,
  descripcion text null,
  creado_por_staff_id uuid null references public.staff(id) on delete set null,
  fecha_creacion timestamptz not null default now(),
  fecha_uso timestamptz null,
  user_id integer null references public.users(id) on delete set null,
  orden_id integer null references public.ordenes(id) on delete set null
);

create index if not exists cupones_descuento_codigo_idx on public.cupones_descuento (codigo);
create index if not exists cupones_descuento_estado_idx on public.cupones_descuento (activo, usado, expira_en);