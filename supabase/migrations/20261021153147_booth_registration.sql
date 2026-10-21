-- How a booth gets its identity: staff issue it a one-time code, and the
-- booth trades the code for its own Auth user and session through the
-- register-booth Edge Function. The service role never leaves the Hub.

alter table public.booth
  -- sha256 of the normalised code; the code itself is never stored.
  add column registration_code_hash text unique,
  add column registration_expires_at timestamptz,
  -- The Auth user the booth signs in as. A new registration replaces it.
  add column auth_user_id uuid unique references auth.users (id) on delete set null,
  add column registered_at timestamptz,
  add constraint booth_registration_code_expiry
    check ((registration_code_hash is null) = (registration_expires_at is null));

-- Staff see what a booth is and whether it is registered, never the code
-- hash or the Auth user behind it.
revoke select on public.booth from authenticated;
grant select (id, org_id, name, live_from, live_until, created_at, registered_at)
  on public.booth to authenticated;

-- Issues a new one-time code for a booth, valid 24 hours, replacing any
-- earlier one. Returns it as XXXXX-XXXXX: ten Crockford base32 characters
-- (no I, L, O or U), 50 random bits. Run from the SQL editor until Studio
-- has a button for it.
create function public.issue_booth_registration_code(p_booth_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_code text := '';
begin
  for i in 0..9 loop
    -- 32 characters, so a byte modulo 32 picks each one with no bias.
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  update public.booth
  set registration_code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex'),
      registration_expires_at = now() + interval '24 hours'
  where id = p_booth_id;
  if not found then
    raise exception 'unknown booth %', p_booth_id using errcode = 'P0002';
  end if;

  return substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5);
end;
$$;

-- Uses a code up, once: returns the booth it belongs to and the Auth user it
-- had, or nothing for a code that is unknown, used or expired.
create function public.claim_booth_registration_code(p_code_hash text)
returns table (booth_id uuid, org_id uuid, booth_name text, previous_auth_user_id uuid)
language sql
security invoker
set search_path = ''
as $$
  update public.booth
  set registration_code_hash = null, registration_expires_at = null
  where registration_code_hash = p_code_hash
    and registration_expires_at > now()
  returning id, org_id, name, auth_user_id
$$;

revoke execute on function public.issue_booth_registration_code(uuid)
  from public, anon, authenticated;
revoke execute on function public.claim_booth_registration_code(text)
  from public, anon, authenticated;
grant execute on function public.issue_booth_registration_code(uuid) to service_role;
grant execute on function public.claim_booth_registration_code(text) to service_role;
