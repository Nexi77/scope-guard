-- Contractors can prepare and revise pending changes, but only the
-- PIN-protected SECURITY DEFINER RPC can make a customer decision final.
revoke insert, update, delete on table public.change_decisions from authenticated;

create function public.prevent_direct_customer_decision_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' and new.status in ('accepted', 'rejected') then
      raise exception 'Customer decisions must be recorded through the shared decision flow'
        using errcode = 'P0001';
    end if;

    if tg_op = 'UPDATE' and (
      (old.status = 'pending' and new.status in ('accepted', 'rejected'))
      or old.status in ('accepted', 'rejected')
    ) then
      raise exception 'Finalized customer decisions cannot be changed directly'
        using errcode = 'P0001';
    end if;

    if tg_op = 'DELETE' and old.status in ('accepted', 'rejected') then
      raise exception 'Finalized customer decisions cannot be deleted directly'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger prevent_direct_customer_decision_mutation
  before insert or update or delete on public.offer_changes
  for each row
  execute function public.prevent_direct_customer_decision_mutation();
