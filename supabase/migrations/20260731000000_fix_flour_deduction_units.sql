-- Fix flour deduction unit mismatch: flour_stock_kg is tracked in sacks
-- (see "Sacks remaining" display and the ×50 conversion in the days-left calc),
-- but flour_used_kg on batches is recorded in real kilograms. The trigger was
-- subtracting kilograms directly from a sacks-denominated column — convert
-- kg to sacks (1 sack = 50kg) before subtracting.
CREATE OR REPLACE FUNCTION public.apply_batch_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stock (product_id, location, cakes)
  VALUES (NEW.product_id, 'store', NEW.cakes_produced)
  ON CONFLICT (product_id, location)
  DO UPDATE SET cakes = public.stock.cakes + EXCLUDED.cakes, updated_at = now();

  UPDATE public.settings SET flour_stock_kg = flour_stock_kg - (NEW.flour_used_kg / 50.0) WHERE id = 1;
  RETURN NEW;
END;
$$;
