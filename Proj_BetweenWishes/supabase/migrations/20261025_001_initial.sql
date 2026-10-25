-- Between Wishes / 心愿之间
-- 001_initial_mvp.sql | Supabase PostgreSQL 初始建库
-- 适用范围：新建的、没有业务数据的 Supabase 项目。
-- 不要在已有业务数据的数据库上直接重复执行或覆盖。
-- 本 SQL 是后续前端迁移的基础；运行后原 GitHub 网站不会自动切换到云端。
-- 安全原则：用户只直接读写自己的心愿；礼物抽选与情侣关系由后台函数检查。
-- -----------------------------------------------------------------------------
create schema if not exists private;

-- 1. 用户资料：登录密码由 Supabase Auth 管理，这里不存储密码或登录令牌。
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9_]{3,24}$'),
  nickname text not null default '新用户'
    check (char_length(nickname) between 1 and 40),
  avatar_url text,
  bio text not null default '',
  birthday date,
  search_enabled boolean not null default true,
  wishlist_paused boolean not null default false,
  gift_reminder_days integer not null default 5
    check (gift_reminder_days between 0 and 90),
  created_at timestamptz not null default now()
);

-- 2. 绑定邀请。仅参与者能读取；用户不能直接写入或修改。
create table public.binding_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  check (requester_id <> target_id)
);
create index binding_requests_target_idx
  on public.binding_requests (target_id, status);

-- 3. 情侣关系。每人同一时间只能有一位伴侣，由后台函数负责检查。
create table public.couples (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.profiles(id) on delete cascade,
  member_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (member_a < member_b)
);
create index couples_a_idx on public.couples (member_a) where ended_at is null;
create index couples_b_idx on public.couples (member_b) where ended_at is null;

-- 4. 心愿。不会把伴侣的原始清单直接发到另一人的浏览器。
create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  image_urls text[] not null default '{}',
  product_url text,
  price numeric(12,2) check (price is null or price >= 0),
  quantity integer not null default 1 check (quantity between 1 and 999),
  specs text,
  category text not null default '其他',
  priority text not null default 'medium'
    check (priority in ('high','medium','low')),
  budget_note text,
  note text,
  deadline date,
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index wishes_owner_idx on public.wishes (owner_id, archived, position);

-- 5. 送礼记录：收礼人在 sent 之前没有读取权限。
create table public.gift_records (
  id uuid primary key default gen_random_uuid(),
  wish_id uuid references public.wishes(id) on delete set null,
  giver_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'drawn'
    check (status in ('drawn','purchased','sent','cancelled')),
  wish_snapshot jsonb not null,
  drawn_at timestamptz not null default now(),
  purchased_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  purchase_note text,
  check (giver_id <> receiver_id)
);
-- 同一心愿不能被同时/重复送出；取消后才能再次抽选。
create unique index gift_one_non_cancelled_per_wish
  on public.gift_records (wish_id)
  where status <> 'cancelled' and wish_id is not null;
create index gift_records_giver_idx on public.gift_records (giver_id, drawn_at desc);
create index gift_records_receiver_idx on public.gift_records (receiver_id, sent_at desc);

-- 6. 站内通知。只有自己的通知可读，且用户只能改“已读”时间。
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  content text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- 7. RLS = 行级访问权限。没有认证的访客不能访问上述表的数据。
alter table public.profiles enable row level security;
alter table public.binding_requests enable row level security;
alter table public.couples enable row level security;
alter table public.wishes enable row level security;
alter table public.gift_records enable row level security;
alter table public.notifications enable row level security;

revoke all on public.profiles, public.binding_requests, public.couples,
  public.wishes, public.gift_records, public.notifications
  from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select on public.binding_requests, public.couples, public.gift_records
  to authenticated;
grant select, insert, update on public.wishes to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Only the account owner can read the FULL profile row.
-- The partner preview RPC below exposes only nickname / username / pause status.
create policy "profile_visible_to_self"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profile_update_self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "binding_read_participants"
  on public.binding_requests for select to authenticated
  using (requester_id = (select auth.uid()) or target_id = (select auth.uid()));

create policy "couples_read_members"
  on public.couples for select to authenticated
  using (member_a = (select auth.uid()) or member_b = (select auth.uid()));

create policy "wish_read_owner"
  on public.wishes for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "wish_insert_owner"
  on public.wishes for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "wish_update_owner"
  on public.wishes for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
-- 不开通 DELETE：前端通过 archived = true 软删除，避免提前泄露抽选状态。

create policy "gift_read_giver_or_receiver_after_sent"
  on public.gift_records for select to authenticated
  using (
    giver_id = (select auth.uid())
    or (receiver_id = (select auth.uid()) and status = 'sent')
  );

create policy "notification_read_self"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notification_mark_read_self"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 8. 新用户注册后，自动建立个人资料。
-- 使用随机用户名，随后可在个人中心设置用户名；邮箱不写入公开资料。
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, nickname)
  values (
    new.id,
    'user_' || substr(replace(new.id::text, '-', ''), 1, 12),
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'nickname'), ''), '新用户'), 40)
  );
  return new;
end;
$$;
create trigger on_between_wishes_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- 9. 私有后台函数。不直接暴露 private schema 给浏览器 API。
create or replace function private.send_invite(p_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_new uuid;
begin
  if v_me is null then raise exception '请先登录'; end if;
  select p.id into v_target from public.profiles p
    where p.username = lower(trim(p_username)) and p.search_enabled = true;
  if v_target is null then raise exception '未找到该用户名或对方未开启搜索'; end if;
  if v_target = v_me then raise exception '不能绑定自己'; end if;
  if exists (select 1 from public.couples c where c.ended_at is null
    and (c.member_a in (v_me, v_target) or c.member_b in (v_me, v_target)))
  then raise exception '一方已有伴侣，请先解绑'; end if;

  -- 已过期的邀请先标记为 expired，避免影响之后重新发起邀请。
  update public.binding_requests
    set status = 'expired'
    where status = 'pending' and expires_at <= now()
      and ((requester_id = v_me and target_id = v_target)
        or (requester_id = v_target and target_id = v_me));

  if exists (select 1 from public.binding_requests r
    where r.status = 'pending' and r.expires_at > now()
      and ((r.requester_id = v_me and r.target_id = v_target)
        or (r.requester_id = v_target and r.target_id = v_me)))
  then raise exception '双方已有待处理的邀请'; end if;

  insert into public.binding_requests (requester_id, target_id)
    values (v_me, v_target) returning id into v_new;
  return v_new;
end;
$$;

create or replace function private.respond_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_req public.binding_requests%rowtype;
begin
  if v_me is null then raise exception '请先登录'; end if;
  select * into v_req from public.binding_requests
    where id = p_invite_id for update;
  if not found or v_req.target_id <> v_me then
    raise exception '邀请不存在或不属于你';
  end if;
  if v_req.status <> 'pending' or v_req.expires_at <= now() then
    raise exception '邀请已处理或已过期';
  end if;
  if p_accept is not true then
    update public.binding_requests set status = 'rejected' where id = p_invite_id;
    return;
  end if;

  -- 按固定顺序锁住双方的用户标识，防止同时接受多个邀请。
  perform pg_advisory_xact_lock(
    hashtextextended(least(v_req.requester_id, v_req.target_id)::text, 0));
  perform pg_advisory_xact_lock(
    hashtextextended(greatest(v_req.requester_id, v_req.target_id)::text, 0));

  if exists (select 1 from public.couples c where c.ended_at is null
    and (c.member_a in (v_req.requester_id, v_req.target_id)
      or c.member_b in (v_req.requester_id, v_req.target_id)))
  then raise exception '其中一方已经绑定了伴侣'; end if;

  insert into public.couples (member_a, member_b)
    values (least(v_req.requester_id,v_req.target_id),
            greatest(v_req.requester_id,v_req.target_id));
  update public.binding_requests set status = 'accepted' where id = p_invite_id;
end;
$$;

create or replace function private.unbind_partner(p_couple_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception '请先登录'; end if;
  update public.couples set ended_at = now()
    where id = p_couple_id and ended_at is null
      and (member_a = v_me or member_b = v_me);
  if not found then raise exception '找不到有效的情侣关系'; end if;
end;
$$;

-- 抽选必须在数据库执行：浏览器不能一次取得伴侣的完整清单。
create or replace function private.draw_wish(p_receiver_id uuid, p_max_budget numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_wish public.wishes%rowtype;
  v_record_id uuid;
begin
  if v_me is null then raise exception '请先登录'; end if;
  if p_receiver_id = v_me then raise exception '不能抽取自己的心愿'; end if;
  if p_max_budget is not null and p_max_budget < 0
    then raise exception '预算不能为负数'; end if;
  if not exists (
    select 1 from public.couples c where c.ended_at is null
    and c.member_a = least(v_me, p_receiver_id)
    and c.member_b = greatest(v_me, p_receiver_id)
  ) then raise exception '请先完成情侣绑定'; end if;
  if exists (
    select 1 from public.profiles p
    where p.id = p_receiver_id and p.wishlist_paused = true
  ) then raise exception '对方暂时关闭了心愿抽选'; end if;

  -- 对同一收礼人串行抽奖，避免并发重复抽中同一个心愿。
  perform pg_advisory_xact_lock(hashtextextended(p_receiver_id::text, 0));

  select w.* into v_wish from public.wishes w
  where w.owner_id = p_receiver_id and w.archived = false
    and (p_max_budget is null or w.price is null or w.price <= p_max_budget)
    and not exists (
      select 1 from public.gift_records g
      where g.wish_id = w.id and g.status <> 'cancelled'
    )
  order by (case w.priority when 'high' then 0 when 'medium' then 1 else 2 end),
           random()
  limit 1 for update of w skip locked;

  if not found then raise exception '暂时没有符合条件的心愿'; end if;

  insert into public.gift_records
    (wish_id, giver_id, receiver_id, wish_snapshot)
  values (v_wish.id, v_me, p_receiver_id, to_jsonb(v_wish))
  returning id into v_record_id;

  return jsonb_build_object('giftRecordId', v_record_id,
                            'wish', to_jsonb(v_wish));
end;
$$;

create or replace function private.change_gift_status(
  p_record_id uuid, p_action text, p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_gift public.gift_records%rowtype;
begin
  if v_me is null then raise exception '请先登录'; end if;
  select * into v_gift from public.gift_records
    where id = p_record_id and giver_id = v_me for update;
  if not found then raise exception '没有权限操作该礼物'; end if;

  if p_action = 'purchased' and v_gift.status = 'drawn' then
    update public.gift_records
      set status = 'purchased', purchased_at = now(), purchase_note = p_note
      where id = p_record_id;
  elsif p_action = 'sent' and v_gift.status in ('drawn','purchased') then
    update public.gift_records
      set status = 'sent', sent_at = now(),
          purchase_note = coalesce(p_note,purchase_note)
      where id = p_record_id;
    insert into public.notifications(user_id, kind, title, content)
      values (v_gift.receiver_id, 'gift_sent', '收到一份心意',
        '你的伴侣送出了一份礼物，打开历史记录看看吧！');
  elsif p_action = 'cancelled' and v_gift.status in ('drawn','purchased') then
    update public.gift_records
      set status = 'cancelled', cancelled_at = now()
      where id = p_record_id;
  else
    raise exception '不允许的礼物状态变化';
  end if;
end;
$$;

-- 浏览器可调用的是普通 public RPC，内部再使用受保护的 private 函数。
create function public.invite_partner(p_username text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.send_invite(p_username); $$;

create function public.respond_partner_invite(p_invite_id uuid, p_accept boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.respond_invite(p_invite_id, p_accept); $$;

create function public.unbind_partner(p_couple_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.unbind_partner(p_couple_id); $$;

create function public.draw_partner_wish(p_receiver_id uuid, p_max_budget numeric default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.draw_wish(p_receiver_id, p_max_budget); $$;

create function public.change_gift_status(
  p_record_id uuid, p_action text, p_note text default null
)
returns void language sql security invoker set search_path = ''
as $$ select private.change_gift_status(p_record_id, p_action, p_note); $$;

-- 不将高权限函数所在的 private schema 暴露在 Supabase Data API 的 Exposed schemas。
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

revoke all on function private.send_invite(text) from public;
revoke all on function private.respond_invite(uuid, boolean) from public;
revoke all on function private.unbind_partner(uuid) from public;
revoke all on function private.draw_wish(uuid, numeric) from public;
revoke all on function private.change_gift_status(uuid, text, text) from public;
revoke all on function private.handle_new_user() from public;

grant execute on function private.send_invite(text) to authenticated;
grant execute on function private.respond_invite(uuid, boolean) to authenticated;
grant execute on function private.unbind_partner(uuid) to authenticated;
grant execute on function private.draw_wish(uuid, numeric) to authenticated;
grant execute on function private.change_gift_status(uuid, text, text) to authenticated;

revoke all on function public.invite_partner(text) from public;
revoke all on function public.respond_partner_invite(uuid, boolean) from public;
revoke all on function public.unbind_partner(uuid) from public;
revoke all on function public.draw_partner_wish(uuid, numeric) from public;
revoke all on function public.change_gift_status(uuid, text, text) from public;

grant execute on function public.invite_partner(text) to authenticated;
grant execute on function public.respond_partner_invite(uuid, boolean) to authenticated;
grant execute on function public.unbind_partner(uuid) to authenticated;
grant execute on function public.draw_partner_wish(uuid, numeric) to authenticated;
grant execute on function public.change_gift_status(uuid, text, text) to authenticated;

-- 完成。下一阶段要改造 React 的 AppContext / LoginModal 才会真正使用这些表。


-- === Production additions: private image storage, invitation previews, safe archiving ===
-- Clients may edit wish content but cannot archive directly; the archive RPC
-- performs all changes without revealing drawn/undrawn status to a recipient.
revoke update on public.wishes from authenticated;
grant update (title, image_urls, product_url, price, quantity, specs, category,
              priority, budget_note, note, deadline, position)
  on public.wishes to authenticated;

create or replace function private.archive_my_wish(p_wish_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_wish public.wishes%rowtype;
  v_gift record;
begin
  if v_me is null then raise exception '请先登录'; end if;
  select * into v_wish from public.wishes
    where id = p_wish_id and owner_id = v_me for update;
  if not found then raise exception '心愿不存在'; end if;
  if v_wish.archived then return; end if;
  update public.wishes set archived = true where id = p_wish_id;
  for v_gift in
    select id, giver_id from public.gift_records
    where wish_id = p_wish_id and status in ('drawn','purchased') for update
  loop
    update public.gift_records set status='cancelled', cancelled_at=now()
      where id=v_gift.id;
    insert into public.notifications (user_id,kind,title,content)
      values (v_gift.giver_id, 'wish_archived', '送礼计划已取消',
              '对方调整了自己的心愿清单，原送礼任务已结束。');
  end loop;
end;
$$;

create or replace function private.list_my_invites()
returns table (
  id uuid, direction text, other_username text, other_nickname text,
  status text, created_at timestamptz, expires_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select r.id,
    case when r.requester_id=auth.uid() then 'sent' else 'received' end,
    p.username, p.nickname, r.status, r.created_at, r.expires_at
  from public.binding_requests r
  join public.profiles p on p.id =
    (case when r.requester_id=auth.uid() then r.target_id else r.requester_id end)
  where r.requester_id=auth.uid() or r.target_id=auth.uid()
  order by r.created_at desc limit 100;
$$;


-- Partner preview is intentionally restricted to a few public-facing fields.
-- No full profile SELECT is given to the partner.
create or replace function private.my_partner_preview()
returns table (
  id uuid, username text, nickname text, wishlist_paused boolean
)
language sql stable security definer set search_path = ''
as $$
  select p.id,p.username,p.nickname,p.wishlist_paused
  from public.couples c
  join public.profiles p
    on p.id = case when c.member_a=auth.uid() then c.member_b else c.member_a end
  where c.ended_at is null
    and (c.member_a=auth.uid() or c.member_b=auth.uid())
  limit 1;
$$;

create function public.my_partner_preview()
returns table (
  id uuid, username text, nickname text, wishlist_paused boolean
)
language sql stable security invoker set search_path = ''
as $$ select * from private.my_partner_preview(); $$;

revoke all on function private.my_partner_preview() from public;
revoke all on function public.my_partner_preview() from public;
grant execute on function private.my_partner_preview() to authenticated;
grant execute on function public.my_partner_preview() to authenticated;

create function public.archive_my_wish(p_wish_id uuid)
returns void language sql security invoker set search_path=''
as $$ select private.archive_my_wish(p_wish_id); $$;

create function public.list_my_invites()
returns table (
  id uuid, direction text, other_username text, other_nickname text,
  status text, created_at timestamptz, expires_at timestamptz
)
language sql security invoker set search_path=''
as $$ select * from private.list_my_invites(); $$;

revoke all on function private.archive_my_wish(uuid) from public;
revoke all on function private.list_my_invites() from public;
revoke all on function public.archive_my_wish(uuid) from public;
revoke all on function public.list_my_invites() from public;
grant execute on function private.archive_my_wish(uuid) to authenticated;
grant execute on function private.list_my_invites() to authenticated;
grant execute on function public.archive_my_wish(uuid) to authenticated;
grant execute on function public.list_my_invites() to authenticated;

-- Invitation rate limiting (five outgoing invitations per hour).
create or replace function private.send_invite(p_username text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_new uuid;
begin
  if v_me is null then raise exception '请先登录'; end if;
  -- Serialize invitation rate-limit checks across tabs / concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(v_me::text, 7));
  if (select count(*) from public.binding_requests
      where requester_id=v_me and created_at > now()-interval '1 hour') >= 5
  then raise exception '邀请过于频繁，请一小时后再试'; end if;
  select p.id into v_target from public.profiles p
    where p.username=lower(trim(p_username)) and p.search_enabled=true;
  if v_target is null then raise exception '未找到该用户名或对方未开启搜索'; end if;
  if v_target=v_me then raise exception '不能绑定自己'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(v_me,v_target)::text,0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(v_me,v_target)::text,0));
  if exists (select 1 from public.couples c where c.ended_at is null
    and (c.member_a in (v_me,v_target) or c.member_b in (v_me,v_target)))
  then raise exception '一方已有伴侣，请先解绑'; end if;
  update public.binding_requests set status='expired'
    where status='pending' and expires_at <= now()
      and ((requester_id=v_me and target_id=v_target)
        or (requester_id=v_target and target_id=v_me));
  if exists (select 1 from public.binding_requests r
    where r.status='pending' and r.expires_at > now()
      and ((r.requester_id=v_me and r.target_id=v_target)
        or (r.requester_id=v_target and r.target_id=v_me)))
  then raise exception '双方已有待处理的邀请'; end if;
  insert into public.binding_requests(requester_id,target_id)
    values (v_me,v_target) returning id into v_new;
  return v_new;
end;
$$;

-- PRIVATE image bucket:
-- object paths: {owner_uuid}/{wish_uuid}/{random_filename}
-- Before a draw, only the owner may read photos.
-- After the draw, only the actual giver may read the matching wish photos.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('wish-images','wish-images',false,5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "bw_image_owner_upload" on storage.objects
for insert to authenticated with check (
  bucket_id='wish-images'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.wishes w
    where w.id::text=(storage.foldername(name))[2]
      and w.owner_id=(select auth.uid()) and w.archived=false
  )
);

-- Security-definer check is necessary here: the giver has NO SELECT
-- permission on the partner's 'wishes' table.
-- The function checks the precise wish / owner / gift record relation.
create or replace function private.may_read_wish_photo(p_path text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    auth.uid() is not null and (
      (storage.foldername(p_path))[1]=auth.uid()::text
      or exists (
        select 1 from public.gift_records g
        join public.wishes w on w.id=g.wish_id
        where g.giver_id=auth.uid()
          and g.status in ('drawn','purchased','sent')
          and w.id::text=(storage.foldername(p_path))[2]
          and w.owner_id::text=(storage.foldername(p_path))[1]
      )
    );
$$;
revoke all on function private.may_read_wish_photo(text) from public;
grant execute on function private.may_read_wish_photo(text) to authenticated;

create policy "bw_image_owner_or_drawn_giver_read"
on storage.objects for select to authenticated
using (bucket_id='wish-images' and private.may_read_wish_photo(name));

create policy "bw_image_owner_delete" on storage.objects
for delete to authenticated using (
  bucket_id='wish-images'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);


-- Prevent scraping a partner's whole private wishlist by repeated draw/cancel.
-- One active task per giver/receiver. A cancelled task still counts toward
-- a 24-hour draw cooldown to prevent rapid enumeration.
create or replace function private.enforce_draw_limits()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if exists (
    select 1 from public.gift_records g
    where g.giver_id=new.giver_id and g.receiver_id=new.receiver_id
      and g.status in ('drawn','purchased')
  ) then
    raise exception '你已有正在准备的礼物，请先完成或取消该任务';
  end if;
  if exists (
    select 1 from public.gift_records g
    where g.giver_id=new.giver_id and g.receiver_id=new.receiver_id
      and g.drawn_at > now()-interval '24 hours'
  ) then
    raise exception '为了保护伴侣的心愿隐私，两次抽选至少需要间隔24小时';
  end if;
  return new;
end;
$$;
create trigger bw_limit_draw_attempts
before insert on public.gift_records
for each row execute function private.enforce_draw_limits();
revoke all on function private.enforce_draw_limits() from public;
