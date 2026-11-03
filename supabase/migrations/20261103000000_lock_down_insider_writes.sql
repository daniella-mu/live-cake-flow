-- 1. trips.acknowledged_at: nothing in the app writes this directly anymore
-- (the trip-resolutions trigger sets it), so block direct writes entirely.
-- Every other column the app legitimately updates stays writable.
REVOKE UPDATE ON public.trips FROM authenticated;
GRANT UPDATE (status, departed_at, arrived_at, received_at, completed_at,
  broken_cakes, notes, crates_received, crates_to_return, overnight_crates,
  empty_crates_returned) ON public.trips TO authenticated;

-- 2. work_sessions: the app only ever sends "now" for logout_at, but the
-- database didn't enforce that. Recompute it server-side instead of trusting
-- the client, and refuse to reopen/re-edit an already-closed session.
CREATE OR REPLACE FUNCTION public.enforce_logout_time()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.logout_at IS NOT NULL THEN
    RAISE EXCEPTION 'This session is already closed';
  END IF;
  NEW.logout_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_logout_time_trigger BEFORE UPDATE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_logout_time();

-- 3. sales: the app never creates a sale without a customer or not paid from
-- balance — close the path that only ever existed in theory.
ALTER TABLE public.sales ADD CONSTRAINT sales_requires_balance_payment
  CHECK (customer_id IS NOT NULL AND paid_from_balance = true);

-- 4. trip_items: extend the existing value-derivation trigger to also
-- confirm the trip is still accepting items (hasn't departed yet).
CREATE OR REPLACE FUNCTION public.enforce_trip_item_values()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cpc INT;
  trip_status public.trip_status;
BEGIN
  SELECT cakes_per_crate INTO cpc FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown product';
  END IF;

  SELECT status INTO trip_status FROM public.trips WHERE id = NEW.trip_id;
  IF trip_status IS NULL THEN
    RAISE EXCEPTION 'Unknown trip';
  END IF;
  IF trip_status <> 'loading' THEN
    RAISE EXCEPTION 'Cannot add items to a trip that has already departed';
  END IF;

  NEW.cakes := NEW.crates * cpc;

  RETURN NEW;
END;
$$;
