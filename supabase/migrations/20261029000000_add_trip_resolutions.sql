CREATE TABLE public.trip_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  resolved_crate_count INT NOT NULL CHECK (resolved_crate_count >= 0),
  resolution_note TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant access per role — admin-only data, no anon grant needed.
-- Scoped to what the app actually uses: never updated or deleted, so only
-- SELECT/INSERT are granted (least-privilege, per the permissions-audit rule).
GRANT SELECT, INSERT ON public.trip_resolutions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_resolutions TO service_role;

ALTER TABLE public.trip_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read trip_resolutions" ON public.trip_resolutions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin insert trip_resolutions" ON public.trip_resolutions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Resolving a trip also marks it acknowledged, in the same atomic step —
-- the admin only ever needs to do one insert, not two separate writes.
CREATE OR REPLACE FUNCTION public.apply_trip_resolution()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.trips SET acknowledged_at = now() WHERE id = NEW.trip_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trip_resolution_trigger AFTER INSERT ON public.trip_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.apply_trip_resolution();
