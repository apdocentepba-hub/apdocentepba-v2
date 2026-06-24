-- Planes anuales de pago único para APDocentePBA
-- Preparado el 2026-06-24.
-- NO ejecutar sin backup y sin confirmar la estructura real de subscription_plans.
-- Política comercial: pagás 10 meses y usás 12.
-- No se realizan reembolsos en dinero. Si un usuario pasa de mensual activo a anual,
-- el crédito proporcional por días no usados se aplica como descuento al checkout anual.

insert into public.subscription_plans (
  code,
  nombre,
  descripcion,
  price_ars,
  trial_days,
  max_distritos,
  max_cargos,
  is_active,
  public_visible,
  sort_order,
  mercadopago_plan_id,
  feature_flags
)
values
  (
    'PLUS_ANUAL',
    'Plan Plus Anual',
    'Pago único anual: 12 meses de Plan Plus por el valor de 10 meses. No tiene débito mensual automático. No se realizan reembolsos en dinero; si pasás desde mensual activo, el proporcional no usado se aplica como descuento.',
    10000,
    0,
    2,
    4,
    true,
    true,
    12,
    null,
    '{"email":true,"whatsapp":false,"telegram":false,"telegram_coming_soon":true,"whatsapp_coming_soon":false,"provincia":true,"insights_plus":false,"annual_one_time":true,"billing_mode":"one_time_yearly","annual_days":365,"no_cash_refund":true}'::jsonb
  ),
  (
    'PREMIUM_ANUAL',
    'Plan Pro Anual',
    'Pago único anual: 12 meses de Plan Pro por el valor de 10 meses. No tiene débito mensual automático. No se realizan reembolsos en dinero; si pasás desde mensual activo, el proporcional no usado se aplica como descuento.',
    20000,
    0,
    3,
    6,
    true,
    true,
    13,
    null,
    '{"email":true,"whatsapp":false,"telegram":false,"telegram_coming_soon":true,"whatsapp_coming_soon":false,"provincia":true,"insights_plus":true,"annual_one_time":true,"billing_mode":"one_time_yearly","annual_days":365,"no_cash_refund":true}'::jsonb
  ),
  (
    'INSIGNE_ANUAL',
    'Plan Insigne Anual',
    'Pago único anual: 12 meses de Plan Insigne por el valor de 10 meses. No tiene débito mensual automático. No se realizan reembolsos en dinero; si pasás desde mensual activo, el proporcional no usado se aplica como descuento.',
    30000,
    0,
    5,
    10,
    true,
    true,
    14,
    null,
    '{"email":true,"whatsapp":false,"telegram":false,"telegram_coming_soon":false,"whatsapp_coming_soon":true,"provincia":true,"insights_plus":true,"emergency_districts":true,"annual_one_time":true,"billing_mode":"one_time_yearly","annual_days":365,"no_cash_refund":true}'::jsonb
  )
on conflict (code) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  price_ars = excluded.price_ars,
  trial_days = excluded.trial_days,
  max_distritos = excluded.max_distritos,
  max_cargos = excluded.max_cargos,
  is_active = excluded.is_active,
  public_visible = excluded.public_visible,
  sort_order = excluded.sort_order,
  mercadopago_plan_id = excluded.mercadopago_plan_id,
  feature_flags = excluded.feature_flags;
