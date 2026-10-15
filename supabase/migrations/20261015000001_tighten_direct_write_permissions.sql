-- Tighten direct write permissions to what the app actually uses.

-- customers: the browser may only insert name/phone/email, and never delete
REVOKE INSERT, DELETE ON public.customers FROM authenticated;
GRANT INSERT (name, phone, email) ON public.customers TO authenticated;

-- stock: only Admin's Manual Adjustment writes stock from the browser
-- (triggers are SECURITY DEFINER and bypass these policies)
DROP POLICY "admin and sales insert stock" ON public.stock;
DROP POLICY "admin and sales update stock" ON public.stock;
CREATE POLICY "admin insert stock" ON public.stock FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update stock" ON public.stock FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- exchanges: append-only; read access stays sales/admin as before
DROP POLICY "sales manage exchanges" ON public.exchanges;
CREATE POLICY "sales read exchanges" ON public.exchanges FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sales insert exchanges" ON public.exchanges FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));
