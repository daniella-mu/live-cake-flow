-- Add handover tracking fields to trips
ALTER TABLE public.trips
  ADD COLUMN crates_received INT,       -- sales enters: how many crates they physically counted on arrival
  ADD COLUMN crates_to_return INT,      -- sales enters: empty crates they are handing back
  ADD COLUMN overnight_crates INT;      -- sales enters: crates with unsold cakes staying at market overnight
