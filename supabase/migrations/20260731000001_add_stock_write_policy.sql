-- The base schema only ever granted SELECT on public.stock. All stock changes made
-- via DB triggers (apply_batch_stock, apply_trip_status, apply_sale_stock) bypass RLS
-- because those functions are SECURITY DEFINER — so this gap went unnoticed. But two
-- features write to stock directly from the browser (Admin's Manual Adjustment, and
-- Sales' Customer Exchange), and both were silently no-op'ing under RLS with no error.
-- INSERT and UPDATE only — neither feature ever deletes a stock row, so DELETE is
-- intentionally not granted here (least privilege).
CREATE POLICY "admin and sales insert stock" ON public.stock FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));

CREATE POLICY "admin and sales update stock" ON public.stock FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));
