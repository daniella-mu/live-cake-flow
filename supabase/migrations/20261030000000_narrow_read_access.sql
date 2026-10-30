-- Narrow reads to what each role actually needs. Every "auth read ..." policy
-- below was open to all logged-in users; none of these tables are read by
-- every role, so this closes the gap between what the app uses and what the
-- database allows.

-- payments: no screen in the app reads this table at all
DROP POLICY "auth read payments" ON public.payments;
CREATE POLICY "admin read payments" ON public.payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- customers: Sales/Admin already get SELECT via "sales manage customers" (FOR ALL)
DROP POLICY "auth read customers" ON public.customers;

-- sales: only the Sales and Admin screens read this table
DROP POLICY "auth read sales" ON public.sales;
CREATE POLICY "sales read sales" ON public.sales FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));

-- profiles: nothing in the app ever updates a profile
DROP POLICY "self update profile" ON public.profiles;
