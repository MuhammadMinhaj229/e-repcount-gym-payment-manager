-- RepCount Supabase schema, policies, and payment consistency triggers.
-- Apply in a new Supabase project before deploying the frontend migration.
-- No passwords or API keys belong in this file.

create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gym_users (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'manager', 'staff')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  duration_c text not null default '1 month',
  price_c numeric(12,2) not null check (price_c > 0),
  description_c text not null default '',
  active_c boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, name)
);

create table if not exists public.gym_members (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  phone_c text not null,
  email_c text,
  plan_c uuid references public.membership_plans(id) on delete set null,
  join_date_c date,
  due_date_c date,
  status_c text not null default 'Active'
    check (status_c in ('Active', 'Due soon', 'Overdue', 'Inactive')),
  notes_c text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.membership_dues (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  member_c uuid not null references public.gym_members(id) on delete restrict,
  plan_c uuid references public.membership_plans(id) on delete set null,
  period_start_c date,
  period_end_c date,
  due_date_c date not null,
  amount_due_c numeric(12,2) not null check (amount_due_c > 0),
  amount_paid_c numeric(12,2) not null default 0 check (amount_paid_c >= 0),
  balance_c numeric(12,2) not null default 0 check (balance_c >= 0),
  status_c text not null default 'Unpaid'
    check (status_c in ('Unpaid', 'Partially paid', 'Paid', 'Waived')),
  notes_c text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, name)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  member_c uuid references public.gym_members(id) on delete set null,
  due_c uuid references public.membership_dues(id) on delete set null,
  amount_c numeric(12,2) not null check (amount_c > 0),
  paid_on_c date not null default current_date,
  method_c text not null default 'UPI'
    check (method_c in ('Cash', 'UPI', 'Card', 'Bank transfer')),
  status_c text not null default 'Paid'
    check (status_c in ('Paid', 'Pending', 'Refunded')),
  notes_c text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, name)
);

create index if not exists gym_users_gym_id_idx on public.gym_users(gym_id);
create index if not exists gym_members_gym_id_name_idx on public.gym_members(gym_id, name);
create index if not exists membership_dues_gym_due_date_idx on public.membership_dues(gym_id, due_date_c);
create index if not exists membership_dues_member_idx on public.membership_dues(member_c);
create index if not exists payments_gym_paid_on_idx on public.payments(gym_id, paid_on_c);
create index if not exists payments_due_status_idx on public.payments(due_c, status_c);
create index if not exists payments_member_idx on public.payments(member_c);

create or replace function public.current_gym_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select gu.gym_id
  from public.gym_users gu
  where gu.user_id = auth.uid()
    and gu.status = 'active'
  limit 1
$$;

create or replace function public.has_gym_role(target_gym_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.gym_users gu
    where gu.user_id = auth.uid()
      and gu.gym_id = target_gym_id
      and gu.status = 'active'
      and gu.role = any (allowed_roles)
  )
$$;

revoke all on function public.current_gym_id() from public;
revoke all on function public.has_gym_role(uuid, text[]) from public;
grant execute on function public.current_gym_id() to authenticated;
grant execute on function public.has_gym_role(uuid, text[]) to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles', 'gym_users', 'membership_plans', 'gym_members', 'membership_dues', 'payments']
  loop
    execute format('drop trigger if exists touch_updated_at on public.%I', table_name);
    execute format(
      'create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.normalize_due_balance()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status_c = 'Waived' then
    new.balance_c := 0;
    return new;
  end if;

  if new.amount_paid_c > new.amount_due_c then
    raise exception 'Recorded payments cannot exceed the fee-cycle amount.';
  end if;

  new.balance_c := greatest(new.amount_due_c - new.amount_paid_c, 0);
  new.status_c := case
    when new.balance_c = 0 then 'Paid'
    when new.amount_paid_c > 0 then 'Partially paid'
    else 'Unpaid'
  end;
  return new;
end;
$$;

drop trigger if exists normalize_due_balance on public.membership_dues;
create trigger normalize_due_balance
before insert or update of amount_due_c, amount_paid_c, status_c
on public.membership_dues
for each row execute function public.normalize_due_balance();

create or replace function public.validate_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  due_gym_id uuid;
  due_member_id uuid;
  due_amount numeric(12,2);
  paid_other_payments numeric(12,2);
begin
  if new.member_c is not null and not exists (
    select 1 from public.gym_members m
    where m.id = new.member_c and m.gym_id = new.gym_id
  ) then
    raise exception 'The selected member does not belong to this gym.';
  end if;

  if new.due_c is not null then
    select d.gym_id, d.member_c, d.amount_due_c
      into due_gym_id, due_member_id, due_amount
    from public.membership_dues d
    where d.id = new.due_c
    for update;

    if not found or due_gym_id <> new.gym_id then
      raise exception 'The selected fee cycle does not belong to this gym.';
    end if;

    if new.member_c is not null and due_member_id <> new.member_c then
      raise exception 'The payment member must match the fee-cycle member.';
    end if;

    if new.status_c = 'Paid' then
      select coalesce(sum(p.amount_c), 0)
        into paid_other_payments
      from public.payments p
      where p.due_c = new.due_c
        and p.gym_id = new.gym_id
        and p.status_c = 'Paid'
        and p.id is distinct from new.id;

      if paid_other_payments + new.amount_c > due_amount then
        raise exception 'This payment exceeds the remaining fee-cycle balance.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_payment on public.payments;
create trigger validate_payment
before insert or update of gym_id, member_c, due_c, amount_c, status_c
on public.payments
for each row execute function public.validate_payment();

create or replace function public.recalculate_due_from_payments(target_due_id uuid, target_gym_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  due_amount numeric(12,2);
  due_status text;
  paid_total numeric(12,2);
begin
  if target_due_id is null then
    return;
  end if;

  select d.amount_due_c, d.status_c
    into due_amount, due_status
  from public.membership_dues d
  where d.id = target_due_id and d.gym_id = target_gym_id
  for update;

  if not found or due_status = 'Waived' then
    return;
  end if;

  select coalesce(sum(p.amount_c), 0)
    into paid_total
  from public.payments p
  where p.due_c = target_due_id
    and p.gym_id = target_gym_id
    and p.status_c = 'Paid';

  update public.membership_dues
  set amount_paid_c = paid_total,
      balance_c = greatest(due_amount - paid_total, 0),
      status_c = case
        when greatest(due_amount - paid_total, 0) = 0 then 'Paid'
        when paid_total > 0 then 'Partially paid'
        else 'Unpaid'
      end
  where id = target_due_id and gym_id = target_gym_id;
end;
$$;

create or replace function public.sync_due_after_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_due_from_payments(old.due_c, old.gym_id);
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (old.due_c is distinct from new.due_c or old.gym_id is distinct from new.gym_id) then
    perform public.recalculate_due_from_payments(old.due_c, old.gym_id);
  end if;

  perform public.recalculate_due_from_payments(new.due_c, new.gym_id);
  return new;
end;
$$;

drop trigger if exists sync_due_after_payment_change on public.payments;
create trigger sync_due_after_payment_change
after insert or update or delete on public.payments
for each row execute function public.sync_due_after_payment_change();

create or replace function public.dashboard_summary(p_today date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'outstanding',
    coalesce((
      select sum(d.balance_c)
      from public.membership_dues d
      where d.gym_id = public.current_gym_id()
        and d.balance_c > 0
        and d.status_c <> 'Waived'
    ), 0),
    'due_today_balance',
    coalesce((
      select sum(d.balance_c)
      from public.membership_dues d
      where d.gym_id = public.current_gym_id()
        and d.due_date_c = p_today
        and d.balance_c > 0
        and d.status_c <> 'Waived'
    ), 0),
    'collected_today',
    coalesce((
      select sum(p.amount_c)
      from public.payments p
      where p.gym_id = public.current_gym_id()
        and p.paid_on_c = p_today
        and p.status_c = 'Paid'
    ), 0)
  )
$$;

grant execute on function public.dashboard_summary(date) to authenticated;

-- Enable RLS everywhere that contains application or workspace data.
alter table public.gyms enable row level security;
alter table public.profiles enable row level security;
alter table public.gym_users enable row level security;
alter table public.membership_plans enable row level security;
alter table public.gym_members enable row level security;
alter table public.membership_dues enable row level security;
alter table public.payments enable row level security;

drop policy if exists gyms_read_current_gym on public.gyms;
create policy gyms_read_current_gym on public.gyms
for select to authenticated
using (id = public.current_gym_id());

drop policy if exists profiles_read_workspace on public.profiles;
create policy profiles_read_workspace on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.gym_users other_user
    where other_user.user_id = profiles.id
      and other_user.gym_id = public.current_gym_id()
      and other_user.status = 'active'
  )
);

drop policy if exists gym_users_read_workspace on public.gym_users;
create policy gym_users_read_workspace on public.gym_users
for select to authenticated
using (gym_id = public.current_gym_id());

drop policy if exists plans_read_workspace on public.membership_plans;
create policy plans_read_workspace on public.membership_plans
for select to authenticated
using (gym_id = public.current_gym_id());

drop policy if exists plans_insert_admin_manager on public.membership_plans;
create policy plans_insert_admin_manager on public.membership_plans
for insert to authenticated
with check (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
  and created_by = auth.uid()
);

drop policy if exists plans_update_admin_manager on public.membership_plans;
create policy plans_update_admin_manager on public.membership_plans
for update to authenticated
using (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
)
with check (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
);

drop policy if exists plans_delete_admin_manager on public.membership_plans;
create policy plans_delete_admin_manager on public.membership_plans
for delete to authenticated
using (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
);

drop policy if exists members_read_workspace on public.gym_members;
create policy members_read_workspace on public.gym_members
for select to authenticated
using (gym_id = public.current_gym_id());

drop policy if exists members_insert_admin_manager on public.gym_members;
create policy members_insert_admin_manager on public.gym_members
for insert to authenticated
with check (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
  and created_by = auth.uid()
);

drop policy if exists members_update_admin_manager on public.gym_members;
create policy members_update_admin_manager on public.gym_members
for update to authenticated
using (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
)
with check (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
);

drop policy if exists members_delete_admin_manager on public.gym_members;
create policy members_delete_admin_manager on public.gym_members
for delete to authenticated
using (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
);

drop policy if exists dues_read_workspace on public.membership_dues;
create policy dues_read_workspace on public.membership_dues
for select to authenticated
using (gym_id = public.current_gym_id());

drop policy if exists dues_insert_admin_manager on public.membership_dues;
create policy dues_insert_admin_manager on public.membership_dues
for insert to authenticated
with check (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
  and created_by = auth.uid()
);

drop policy if exists dues_update_admin_manager on public.membership_dues;
create policy dues_update_admin_manager on public.membership_dues
for update to authenticated
using (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
)
with check (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
);

drop policy if exists dues_delete_admin_manager on public.membership_dues;
create policy dues_delete_admin_manager on public.membership_dues
for delete to authenticated
using (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
);

drop policy if exists payments_read_workspace on public.payments;
create policy payments_read_workspace on public.payments
for select to authenticated
using (gym_id = public.current_gym_id());

drop policy if exists payments_insert_members on public.payments;
create policy payments_insert_members on public.payments
for insert to authenticated
with check (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager', 'staff']::text[])
  and created_by = auth.uid()
);

drop policy if exists payments_update_admin_manager on public.payments;
create policy payments_update_admin_manager on public.payments
for update to authenticated
using (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
)
with check (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
);

drop policy if exists payments_delete_admin_manager on public.payments;
create policy payments_delete_admin_manager on public.payments
for delete to authenticated
using (
  gym_id = public.current_gym_id()
  and public.has_gym_role(gym_id, array['admin', 'manager']::text[])
);

-- Keep the default PostgREST grants explicit. User/profile/role writes are server-only.
grant select on public.gyms, public.profiles, public.gym_users to authenticated;
grant select, insert, update, delete on public.membership_plans, public.gym_members,
  public.membership_dues, public.payments to authenticated;

-- Private workspace file bucket used only if the UI later enables file uploads.
insert into storage.buckets (id, name, public)
values ('repcount-files', 'repcount-files', false)
on conflict (id) do nothing;

drop policy if exists repcount_files_read_workspace on storage.objects;
create policy repcount_files_read_workspace on storage.objects
for select to authenticated
using (
  bucket_id = 'repcount-files'
  and (storage.foldername(name))[1] = public.current_gym_id()::text
);

drop policy if exists repcount_files_insert_workspace on storage.objects;
create policy repcount_files_insert_workspace on storage.objects
for insert to authenticated
with check (
  bucket_id = 'repcount-files'
  and (storage.foldername(name))[1] = public.current_gym_id()::text
);

drop policy if exists repcount_files_update_workspace on storage.objects;
create policy repcount_files_update_workspace on storage.objects
for update to authenticated
using (
  bucket_id = 'repcount-files'
  and (storage.foldername(name))[1] = public.current_gym_id()::text
)
with check (
  bucket_id = 'repcount-files'
  and (storage.foldername(name))[1] = public.current_gym_id()::text
);

drop policy if exists repcount_files_delete_workspace on storage.objects;
create policy repcount_files_delete_workspace on storage.objects
for delete to authenticated
using (
  bucket_id = 'repcount-files'
  and (storage.foldername(name))[1] = public.current_gym_id()::text
);
