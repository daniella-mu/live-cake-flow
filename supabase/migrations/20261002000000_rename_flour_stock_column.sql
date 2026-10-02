-- flour_stock_kg actually stores a count of sacks (matches the "Sacks
-- remaining" UI label), not kilograms. Renaming for clarity — no behavior
-- change, the underlying unit-conversion bug was already fixed separately
-- in 20260731000000_fix_flour_deduction_units.sql.
ALTER TABLE public.settings RENAME COLUMN flour_stock_kg TO flour_stock_sacks;

CREATE OR REPLACE FUNCTION public.apply_batch_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stock (product_id, location, cakes)
  VALUES (NEW.product_id, 'store', NEW.cakes_produced)
  ON CONFLICT (product_id, location)
  DO UPDATE SET cakes = public.stock.cakes + EXCLUDED.cakes, updated_at = now();

  UPDATE public.settings SET flour_stock_sacks = flour_stock_sacks - (NEW.flour_used_kg / 50.0) WHERE id = 1;
  RETURN NEW;
END;
$$;
