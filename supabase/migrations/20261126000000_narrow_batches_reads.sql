-- "auth read batches" (USING true) lets any authenticated account — any role —
-- read every worker's production history directly via the API, bypassing the
-- UI's own worker_id filter entirely.
-- No other screen touches batches at all.
DROP POLICY "auth read batches" ON public.batches;
CREATE POLICY "workers read own batches, admin reads all" ON public.batches
  FOR SELECT TO authenticated
  USING (worker_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));