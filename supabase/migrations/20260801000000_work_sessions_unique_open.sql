-- Enforce "at most one open session per user" atomically at the database level.
-- The client-side check-then-insert in logSession() (auth-context.tsx) is inherently
-- racy: two near-simultaneous SIGNED_IN events can both see "no open session" before
-- either INSERT commits, producing duplicate open rows that inflate Staff tab hours.
CREATE UNIQUE INDEX work_sessions_one_open_per_user
  ON public.work_sessions (user_id)
  WHERE logout_at IS NULL;
