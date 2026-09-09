-- exchanges was the only write-capable table without a has_role() check — its
-- original policy let ANY authenticated user (worker, delivery, etc.) insert,
-- update, or delete exchange records, unlike every other table in the schema.
-- Tighten it to match the same sales/admin scoping used on customers/payments/sales.
DROP POLICY "Allow all for authenticated" ON public.exchanges;

CREATE POLICY "sales manage exchanges" ON public.exchanges FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));
