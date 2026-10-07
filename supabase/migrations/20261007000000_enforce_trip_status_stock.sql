-- Add a sufficiency check before apply_trip_status moves stock between locations.
-- Previously it subtracted unconditionally, which could push store/transit stock
-- negative if two trips raced each other or stock changed between a trip being
-- loaded and actually departing/arriving. FOR UPDATE locks the row being checked
-- so two concurrent trips can't both pass against the same stale number.
CREATE OR REPLACE FUNCTION public.apply_trip_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD;
  avail INT;
BEGIN
  IF NEW.status = 'in_transit' AND OLD.status = 'loading' THEN
    FOR r IN SELECT * FROM public.trip_items WHERE trip_id = NEW.id LOOP
      SELECT cakes INTO avail FROM public.stock
        WHERE product_id = r.product_id AND location = 'store' FOR UPDATE;
      IF avail IS NULL OR avail < r.cakes THEN
        RAISE EXCEPTION 'Not enough stock at store to depart with this trip';
      END IF;

      UPDATE public.stock SET cakes = cakes - r.cakes, updated_at = now()
        WHERE product_id = r.product_id AND location = 'store';
      INSERT INTO public.stock (product_id, location, cakes) VALUES (r.product_id, 'transit', r.cakes)
        ON CONFLICT (product_id, location) DO UPDATE SET cakes = public.stock.cakes + EXCLUDED.cakes, updated_at = now();
    END LOOP;
  ELSIF NEW.status = 'received' AND OLD.status IN ('arrived','in_transit') THEN
    FOR r IN SELECT * FROM public.trip_items WHERE trip_id = NEW.id LOOP
      SELECT cakes INTO avail FROM public.stock
        WHERE product_id = r.product_id AND location = 'transit' FOR UPDATE;
      IF avail IS NULL OR avail < r.cakes THEN
        RAISE EXCEPTION 'Not enough stock in transit to mark received';
      END IF;

      UPDATE public.stock SET cakes = cakes - r.cakes, updated_at = now()
        WHERE product_id = r.product_id AND location = 'transit';
      INSERT INTO public.stock (product_id, location, cakes) VALUES (r.product_id, 'market', r.cakes)
        ON CONFLICT (product_id, location) DO UPDATE SET cakes = public.stock.cakes + EXCLUDED.cakes, updated_at = now();
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
