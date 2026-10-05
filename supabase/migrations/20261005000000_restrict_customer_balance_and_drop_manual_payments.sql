-- Restrict customers.balance to be updatable only by the apply_payment/apply_sale_stock
-- triggers (SECURITY DEFINER, bypasses grants) — authenticated users can still update
-- their own editable fields, just not balance directly.
REVOKE UPDATE ON public.customers FROM authenticated;
GRANT UPDATE (name, phone, email) ON public.customers TO authenticated;

-- Remove a now-unused manual payment entry path predating the Paystack integration.
-- All top-ups now go through paystack-webhook.
DROP POLICY "sales insert payments" ON public.payments;
