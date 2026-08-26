# CLAUDE.md

Project-specific rules Claude must follow when working in this repo.

## Code Review Checklist

Before finishing any new or updated file, run through these questions:

1. **Error handling** — does every Supabase query show a `toast.error()` if it fails? The screen must never go blank silently. Exception: silent, non-interactive background writes (e.g. `logSession()` in `auth-context.tsx`) can log to `console.error` instead — a toast here would interrupt whoever happens to be logging in with an error they didn't cause and can't act on, not the person who'd actually need to know. Use this exception sparingly and only for writes that don't block or affect what the acting user is trying to do.
2. **DB triggers vs frontend** — is business logic (stock updates, flour deduction, balance changes) happening in a DB trigger, not in frontend code?
3. **Styling consistency** — use theme CSS variables (`text-destructive`, `bg-muted`, `border-border`) not hardcoded Tailwind colors (`text-red-600`, `bg-red-50`).
4. **Security** — is this built in the most secure way? In this repo that means: every new table has RLS policies (see the pattern in `supabase/migrations/`); the service-role key is only ever used inside Supabase Edge Functions, never client-side; webhook payloads are signature-verified, not trusted via a shared-secret query param; `.env`/`.dev.vars` stay gitignored.
5. **Efficiency** — is this built in the most efficient way? Batch Supabase queries with `Promise.all(...)` (the pattern already used in `admin.tsx`'s `bootstrap()`) rather than sequential awaits; reuse existing realtime subscriptions instead of polling; avoid refetching data already held in component state.
6. **Regressions** — what regressions could this introduce? A lot of business logic lives in DB triggers (`apply_batch_stock`, `apply_sale_stock`, `apply_payment`, `apply_trip_status`) — schema/product changes can silently break these. Renaming or removing a product can break hardcoded lookups like the `PRODUCT_EMOJI` maps in `admin.tsx`/`worker.tsx`. Check RLS policy changes don't accidentally narrow access for an existing role.
7. **Tests** — there is no automated test suite in this repo, so "tests" means manual verification across three layers. Ask:
   - Does this change touch a DB trigger or Edge Function (`apply_batch_stock`, `apply_sale_stock`, `apply_payment`, `apply_trip_status`, `sms-webhook`/future Paystack functions)? If so, verify its logic directly (a raw SQL insert or a `curl` against the function) rather than only through the UI.
   - Is there a multi-step user flow this touches (the delivery→sales handshake, a sale against customer balance, worker batch logging, a customer exchange)? Click through that flow end-to-end, not just the single screen that changed.
   - Does this involve realtime sync or shift auto-detection? Confirm realtime updates actually propagate by testing with two browser sessions open at once (e.g. Worker submits a batch in one tab, Admin dashboard updates live in another); if it touches shift logic, sanity-check behavior near the 6am/6pm boundary.

## Creating a New Supabase Table

Since Oct 30, 2026, Supabase no longer grants default Data API access to new tables in `public` — a table with no explicit `GRANT` is invisible to `supabase-js`/PostgREST/GraphQL even with RLS off. Tables are still created directly in the dashboard SQL editor (not via the Supabase CLI), but every change should also be saved as a new file in `supabase/migrations/` (format: `YYYYMMDDHHMMSS_description.sql`) so there's a permanent record in the repo — run this template every time, before shipping any feature that relies on the new table:

```sql
-- Grant access per role
grant select
  on public.your_table
  to anon;

grant select, insert, update, delete
  on public.your_table
  to authenticated;

grant select, insert, update, delete
  on public.your_table
  to service_role;

-- Enable RLS
alter table public.your_table
  enable row level security;

-- Add policies
create policy "users can read their own rows"
  on public.your_table
  for select to authenticated
  using (auth.uid() = user_id);
```

Adjust role grants and policies to the table's actual access pattern (e.g. admin-only tables shouldn't grant `anon`). If PostgREST returns a `42501` error, it names the missing grant directly.

## Git Workflow

- **Commit messages** follow Conventional Commits — prefix every commit with `fix:`, `feat:`, `chore:`, `docs:`, `refactor:`, etc., matching the type of change (see existing history, e.g. `fix: sms-webhook field name and phone regex`, `chore: gitignore personal planning docs`). Keep the summary short.
- **Single `dev` branch** — this is a solo project; all work happens on one ongoing `dev` branch rather than a new branch per feature/fix.
- **Respect `.gitignore` intent** — personal planning/scratch docs are deliberately excluded from version control. Never stage them even via a broad `git add .`/`git add -A`, and if any get renamed, update `.gitignore` to match rather than letting them slip into a commit.
