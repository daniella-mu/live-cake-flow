ALTER TABLE public.batches ADD COLUMN shift TEXT CHECK (shift IN ('day', 'night'));
