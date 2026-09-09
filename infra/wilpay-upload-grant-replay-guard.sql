-- W.I.L Pay — atomic upload grant replay protection
-- Apply only to the dedicated W.I.L Pay PostgreSQL/Neon project.
-- This migration is additive and does not delete or mutate existing customer data.

create table if not exists wilpay_upload_grant_nonce (
  request_id text primary key,
  owner_user_id text not null,
  file_id text not null,
  object_key text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint wilpay_upload_grant_nonce_request_id_chk
    check (char_length(request_id) between 1 and 128 and request_id ~ '^[A-Za-z0-9_-]+$'),
  constraint wilpay_upload_grant_nonce_expiry_chk
    check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  constraint wilpay_upload_grant_nonce_scope_chk
    check (object_key like 'wilpay/production/%')
);

create index if not exists wilpay_upload_grant_nonce_expiry_idx
  on wilpay_upload_grant_nonce (expires_at);

create index if not exists wilpay_upload_grant_nonce_owner_file_idx
  on wilpay_upload_grant_nonce (owner_user_id, file_id);

-- Backend-only helper. A grant can be consumed exactly once.
-- The UPDATE lock is atomic across devices/processes sharing this database.
create or replace function wilpay_consume_upload_grant(
  p_request_id text,
  p_owner_user_id text,
  p_file_id text,
  p_object_key text,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rows integer;
begin
  update wilpay_upload_grant_nonce
     set consumed_at = p_now
   where request_id = p_request_id
     and owner_user_id = p_owner_user_id
     and file_id = p_file_id
     and object_key = p_object_key
     and consumed_at is null
     and expires_at > p_now;

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- Deliberately no DELETE policy or automatic destructive cleanup here.
-- Expired nonce cleanup must be introduced separately with an approved retention policy.
