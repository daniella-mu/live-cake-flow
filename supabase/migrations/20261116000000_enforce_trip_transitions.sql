-- Enforce the trip lifecycle at the database level.
--
-- Today, "delivery update trips" only checks WHO can update a row (delivery/sales/admin),
-- never WHAT they write. That means status can be set to anything regardless of what it
-- was before (skipping steps, or resetting backward then forward again to double-fire
-- apply_trip_status's stock movement), and crates_received/crates_to_return/
-- overnight_crates/empty_crates_returned can be rewritten at any time, even after a trip
-- is completed -- defeating the entire point of the discrepancy-detection feature, which
-- depends on two sides independently reporting a number that can't be quietly edited to
-- match afterward.
--
-- 1. Constrain the four trip report fields to non-negative (none had any constraint before).
ALTER TABLE public.trips
  ADD CONSTRAINT trips_crates_received_nonneg CHECK (crates_received IS NULL OR crates_received >= 0),
  ADD CONSTRAINT trips_crates_to_return_nonneg CHECK (crates_to_return IS NULL OR crates_to_return >= 0),
  ADD CONSTRAINT trips_overnight_crates_nonneg CHECK (overnight_crates IS NULL OR overnight_crates >= 0),
  ADD CONSTRAINT trips_empty_crates_returned_nonneg CHECK (empty_crates_returned IS NULL OR empty_crates_returned >= 0);

-- 2. Every new trip must start at "loading" -- closes a bypass of the transition guard below
--    (a forged insert could otherwise create a trip already "completed").
DROP POLICY "delivery insert trips" ON public.trips;
CREATE POLICY "delivery insert trips" ON public.trips FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(), 'delivery') OR public.has_role(auth.uid(), 'admin')) AND status = 'loading');

-- 3. Enforce the trip lifecycle: status can only move one legal step forward,
--    and the four report fields can only be written once -- corrections go through
--    trip_resolutions (admin-only, auditable), not by silently rewriting the original report.
CREATE OR REPLACE FUNCTION public.enforce_trip_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'loading'    AND NEW.status = 'in_transit') OR
      (OLD.status = 'in_transit' AND NEW.status = 'arrived')    OR
      (OLD.status = 'arrived'    AND NEW.status = 'received')   OR
      (OLD.status = 'received'   AND NEW.status = 'completed')
    ) THEN
      RAISE EXCEPTION 'Illegal trip status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF OLD.crates_received IS NOT NULL AND NEW.crates_received IS DISTINCT FROM OLD.crates_received THEN
    RAISE EXCEPTION 'crates_received is already set and cannot be changed';
  END IF;
  IF OLD.crates_to_return IS NOT NULL AND NEW.crates_to_return IS DISTINCT FROM OLD.crates_to_return THEN
    RAISE EXCEPTION 'crates_to_return is already set and cannot be changed';
  END IF;
  IF OLD.overnight_crates IS NOT NULL AND NEW.overnight_crates IS DISTINCT FROM OLD.overnight_crates THEN
    RAISE EXCEPTION 'overnight_crates is already set and cannot be changed';
  END IF;
  IF OLD.empty_crates_returned IS NOT NULL AND NEW.empty_crates_returned IS DISTINCT FROM OLD.empty_crates_returned THEN
    RAISE EXCEPTION 'empty_crates_returned is already set and cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_trip_transition_trigger
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.enforce_trip_transition();
