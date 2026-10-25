-- Only-read schema checks for Supabase SQL Editor.
-- This confirms objects exist; it does NOT replace real two-account RLS tests.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles','binding_requests','couples',
    'wishes','gift_records','notifications'
  )
order by c.relname;

select p.proname as rpc_name
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'invite_partner', 'respond_partner_invite', 'unbind_partner',
    'draw_partner_wish', 'change_gift_status',
    'archive_my_wish', 'list_my_invites', 'my_partner_preview'
  )
order by p.proname;

select id, name, public as is_public
from storage.buckets
where id = 'wish-images';
