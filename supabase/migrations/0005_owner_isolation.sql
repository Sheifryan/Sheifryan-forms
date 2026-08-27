-- -------------------------------------------------------------------------
-- Owner data isolation: a logged-in user must never see another user's
-- forms, even if those forms are published.
--
-- Problem: the "anyone can read published forms" policy applies to BOTH the
-- `anon` role (needed for the public /f/[id] share page) and the
-- `authenticated` role. Because RLS unions all policies, an authenticated
-- user's `select on forms` returned their own rows (owner policy) PLUS every
-- other user's published rows (public-read policy) — leaking other users'
-- forms into the dashboard, all-forms, submissions and analytics pages.
--
-- Fix: restrict the public-read policy to the `anon` role only. Authenticated
-- users now get exactly one path — the "owners manage own forms" policy — so
-- they can only ever see their own rows.
--
-- Note: an `authenticated` visitor opening another user's public share link
-- while signed in will see it as not found (they can view it logged out, or
-- as the owner). This is the intended privacy behavior.
-- -------------------------------------------------------------------------
drop policy if exists "anyone can read published forms" on forms;

create policy "anyone can read published forms"
  on forms for select
  to anon
  using (status = 'published');
