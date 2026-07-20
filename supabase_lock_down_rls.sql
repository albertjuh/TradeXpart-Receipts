-- Phase B — DO NOT RUN YET.
--
-- Only run this after you have:
--   1. Run supabase_add_auth.sql
--   2. Created your account in Supabase Dashboard → Authentication → Users
--   3. Confirmed you can sign in to the deployed app and it loads normally
--   4. Confirmed Sign Out works and returns you to the login screen
--
-- This removes the current wide-open policies on receipts/shipments/sales
-- and requires a logged-in user for all access. Once this runs, the app
-- (and the raw Supabase API) becomes unusable for anyone not signed in —
-- including you, if step 3 above wasn't actually confirmed working first.

do $$
declare pol record; t text;
begin
  foreach t in array array['receipts','shipments','sales'] loop
    for pol in select policyname from pg_policies where tablename = t loop
      execute format('drop policy %I on %I', pol.policyname, t);
    end loop;
    execute format(
      'create policy %I on %I for all using (auth.uid() is not null) with check (auth.uid() is not null)',
      t || '_authenticated_access', t
    );
  end loop;
end $$;
