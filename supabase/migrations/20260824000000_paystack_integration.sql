-- Drop the till number — Paystack payments don't use a till, and this developer
-- doesn't own the client's real one. Add fields needed for Paystack top-ups:
-- customers.email (required by Paystack's /transaction/initialize) and
-- payments.paystack_reference (idempotency key for the webhook).
ALTER TABLE public.settings DROP COLUMN till_number;
ALTER TABLE public.customers ADD COLUMN email TEXT;
ALTER TABLE public.payments ADD COLUMN paystack_reference TEXT;

-- Partial unique index: only paystack-sourced rows are constrained (NULL never
-- collides with NULL in a unique index), so pre-existing manual/mpesa rows are
-- unaffected. This is the idempotency backstop against webhook retries.
CREATE UNIQUE INDEX payments_paystack_reference_unique
  ON public.payments (paystack_reference)
  WHERE paystack_reference IS NOT NULL;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_source_check CHECK (source IN ('manual', 'paystack'));
