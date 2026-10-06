-- Derive trip_items.cakes server-side from crates and the product's cakes_per_crate,
-- overwriting any client-supplied value. Runs BEFORE INSERT; apply_trip_status
-- (fires later, on trip status changes) then moves stock using this verified number.
CREATE OR REPLACE FUNCTION public.enforce_trip_item_values()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cpc INT;
BEGIN
  SELECT cakes_per_crate INTO cpc FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown product';
  END IF;

  NEW.cakes := NEW.crates * cpc;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_trip_item_values_trigger BEFORE INSERT ON public.trip_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_trip_item_values();
