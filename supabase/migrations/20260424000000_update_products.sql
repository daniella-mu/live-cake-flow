-- Remove old placeholder products
DELETE FROM public.products;

-- Insert demo product catalog
INSERT INTO public.products (name, cakes_per_crate, crates_per_mix, flour_per_mix_kg, active) VALUES
  ('Chocolate Cake',    30, 1, 5, true),
  ('Vanilla Cake',      30, 1, 6, true),
  ('Black Forest Cake', 30, 3, 6, true),
  ('Red Velvet Cake',   30, 1, 7, true);

-- Update global settings to match new defaults
UPDATE public.settings SET
  cakes_per_crate  = 30,
  crates_per_mix   = 1,
  flour_per_mix_kg = 6,
  flour_stock_kg   = 0,
  retail_price     = 60,
  wholesale_price  = 45
WHERE id = 1;
