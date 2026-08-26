CREATE TABLE public.exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  customer_id UUID REFERENCES public.customers(id),
  returned_product_id UUID REFERENCES public.products(id),
  replacement_product_id UUID REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  reason TEXT,
  sales_user_id UUID
);

ALTER TABLE public.exchanges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON public.exchanges FOR ALL TO authenticated USING (true) WITH CHECK (true);
