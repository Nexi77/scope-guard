alter table public.offer_items
  add constraint offer_items_unit_supported
  check (unit in ('piece', 'set', 'm', 'm²', 'm³', 'kg', 'l', 'hour'));
