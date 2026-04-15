create extension if not exists "pgcrypto";

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_pin_hash text not null,
  theme text not null default 'acik' check (theme in ('acik', 'koyu')),
  audio_enabled boolean not null default true,
  child_sleep_time text not null default '22:00',
  parent_sleep_time text not null default '00:00',
  day_reset_time text not null default '00:00',
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  role text not null check (role in ('ebeveyn', 'çocuk')),
  avatar text not null,
  color text not null,
  birthdate date,
  points integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists users_family_idx on users(family_id);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  icon text not null default '⭐',
  points integer not null default 10 check (points > 0),
  assigned_to uuid[] not null default '{}',
  schedule_type text not null check (schedule_type in ('gunluk', 'haftalik', 'ozel')),
  days text[] not null default '{}',
  special_dates date[] not null default '{}',
  time_block text not null default 'her_zaman' check (time_block in ('sabah', 'ogleden_sonra', 'aksam', 'her_zaman')),
  created_at timestamptz not null default now()
);

create index if not exists tasks_family_idx on tasks(family_id);
create index if not exists tasks_assigned_to_idx on tasks using gin(assigned_to);

create table if not exists completions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  completion_date date not null,
  points_earned integer not null,
  created_at timestamptz not null default now(),
  unique(user_id, task_id, completion_date)
);

create index if not exists completions_family_idx on completions(family_id, completion_date desc);

create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  points_required integer not null check (points_required > 0),
  approval_required boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists redemptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  reward_id uuid not null references rewards(id) on delete cascade,
  status text not null check (status in ('beklemede', 'onaylandi', 'reddedildi')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists redemptions_family_idx on redemptions(family_id, requested_at desc);

create table if not exists point_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  delta integer not null,
  source text not null check (source in ('gorev', 'odul', 'manuel')),
  task_id uuid references tasks(id) on delete set null,
  reward_id uuid references rewards(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists point_events_family_idx on point_events(family_id, created_at desc);
create index if not exists point_events_user_idx on point_events(user_id, created_at desc);

create or replace function toggle_task_completion(
  p_user_id uuid,
  p_task_id uuid,
  p_completion_date date
)
returns table (completed boolean, points_change integer, total_points integer)
language plpgsql
as $$
declare
  v_task tasks%rowtype;
  v_user users%rowtype;
  v_completion completions%rowtype;
  v_total_points integer;
begin
  select * into v_task from tasks where id = p_task_id;
  if not found then
    raise exception 'Görev bulunamadı';
  end if;

  select * into v_user from users where id = p_user_id;
  if not found then
    raise exception 'Kullanıcı bulunamadı';
  end if;

  if v_task.family_id <> v_user.family_id then
    raise exception 'Aile bilgisi eşleşmedi';
  end if;

  if not (p_user_id = any(v_task.assigned_to)) then
    raise exception 'Görev bu kullanıcıya atanmadı';
  end if;

  select * into v_completion
  from completions
  where user_id = p_user_id
    and task_id = p_task_id
    and completion_date = p_completion_date;

  if found then
    delete from completions where id = v_completion.id;

    insert into point_events (family_id, user_id, delta, source, task_id, note)
    values (v_user.family_id, p_user_id, -v_completion.points_earned, 'gorev', p_task_id, 'Görev geri alındı');

    update users
    set points = points - v_completion.points_earned
    where id = p_user_id
    returning points into v_total_points;

    return query select false, -v_completion.points_earned, v_total_points;
  end if;

  insert into completions (family_id, user_id, task_id, completion_date, points_earned)
  values (v_user.family_id, p_user_id, p_task_id, p_completion_date, v_task.points);

  insert into point_events (family_id, user_id, delta, source, task_id, note)
  values (v_user.family_id, p_user_id, v_task.points, 'gorev', p_task_id, 'Görev tamamlandı');

  update users
  set points = points + v_task.points
  where id = p_user_id
  returning points into v_total_points;

  return query select true, v_task.points, v_total_points;
end;
$$;

create or replace function request_reward_redemption(
  p_user_id uuid,
  p_reward_id uuid
)
returns table (redemption_id uuid, status text, remaining_points integer)
language plpgsql
as $$
declare
  v_user users%rowtype;
  v_reward rewards%rowtype;
  v_redemption_id uuid;
  v_points integer;
begin
  select * into v_user from users where id = p_user_id;
  if not found then
    raise exception 'Kullanıcı bulunamadı';
  end if;

  select * into v_reward from rewards where id = p_reward_id;
  if not found then
    raise exception 'Ödül bulunamadı';
  end if;

  if v_user.family_id <> v_reward.family_id then
    raise exception 'Aile bilgisi eşleşmedi';
  end if;

  if v_user.points < v_reward.points_required then
    raise exception 'Yeterli puan yok';
  end if;

  if v_reward.approval_required then
    insert into redemptions (family_id, user_id, reward_id, status)
    values (v_user.family_id, p_user_id, p_reward_id, 'beklemede')
    returning id into v_redemption_id;

    return query select v_redemption_id, 'beklemede'::text, v_user.points;
  end if;

  insert into redemptions (family_id, user_id, reward_id, status, resolved_at)
  values (v_user.family_id, p_user_id, p_reward_id, 'onaylandi', now())
  returning id into v_redemption_id;

  update users
  set points = points - v_reward.points_required
  where id = p_user_id
  returning points into v_points;

  insert into point_events (family_id, user_id, delta, source, reward_id, note)
  values (v_user.family_id, p_user_id, -v_reward.points_required, 'odul', p_reward_id, 'Ödül otomatik verildi');

  return query select v_redemption_id, 'onaylandi'::text, v_points;
end;
$$;

create or replace function resolve_redemption(
  p_redemption_id uuid,
  p_status text
)
returns table (user_id uuid, total_points integer)
language plpgsql
as $$
declare
  v_redemption redemptions%rowtype;
  v_reward rewards%rowtype;
  v_user users%rowtype;
  v_total integer;
begin
  if p_status not in ('onaylandi', 'reddedildi') then
    raise exception 'Geçersiz durum';
  end if;

  select * into v_redemption from redemptions where id = p_redemption_id;
  if not found then
    raise exception 'Talep bulunamadı';
  end if;

  select * into v_reward from rewards where id = v_redemption.reward_id;
  select * into v_user from users where id = v_redemption.user_id;

  if v_redemption.status <> 'beklemede' then
    return query select v_redemption.user_id, v_user.points;
    return;
  end if;

  if p_status = 'onaylandi' then
    if v_user.points < v_reward.points_required then
      raise exception 'Onay için yeterli puan yok';
    end if;

    update users
    set points = points - v_reward.points_required
    where id = v_user.id
    returning points into v_total;

    insert into point_events (family_id, user_id, delta, source, reward_id, note)
    values (v_redemption.family_id, v_user.id, -v_reward.points_required, 'odul', v_reward.id, 'Ödül onaylandı');
  else
    v_total := v_user.points;
  end if;

  update redemptions
  set status = p_status,
      resolved_at = now()
  where id = p_redemption_id;

  return query select v_user.id, v_total;
end;
$$;

create or replace function adjust_user_points(
  p_user_id uuid,
  p_delta integer,
  p_note text default 'Manuel düzenleme'
)
returns table (total_points integer)
language plpgsql
as $$
declare
  v_user users%rowtype;
  v_total integer;
begin
  select * into v_user from users where id = p_user_id;
  if not found then
    raise exception 'Kullanıcı bulunamadı';
  end if;

  update users
  set points = points + p_delta
  where id = p_user_id
  returning points into v_total;

  insert into point_events (family_id, user_id, delta, source, note)
  values (v_user.family_id, p_user_id, p_delta, 'manuel', p_note);

  return query select v_total;
end;
$$;
