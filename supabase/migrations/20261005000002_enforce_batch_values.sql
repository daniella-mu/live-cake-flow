-- Derive batch output and flour use server-side from mixes and the product's
-- stored constants, overwriting any client-supplied values. Runs BEFORE INSERT;
-- apply_batch_stock (AFTER INSERT) then uses these verified numbers.
CREATE OR REPLACE FUNCTION public.enforce_batch_values()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p RECORD;
BEGIN
  SELECT crates_per_mix, cakes_per_crate, flour_per_mix_kg INTO p
    FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown product';
  END IF;

  NEW.crates_produced := NEW.mixes * p.crates_per_mix;
  NEW.cakes_produced := NEW.crates_produced * p.cakes_per_crate;
  NEW.flour_used_kg := NEW.mixes * p.flour_per_mix_kg;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_batch_values_trigger BEFORE INSERT ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_batch_values();
