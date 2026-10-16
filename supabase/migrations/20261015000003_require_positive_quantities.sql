-- Quantities and configured numbers must be positive: a negative or zero value
-- would run the stock/price math backwards or produce nothing from real inputs.
ALTER TABLE public.trip_items ADD CONSTRAINT trip_items_crates_positive CHECK (crates > 0);
ALTER TABLE public.exchanges ADD CONSTRAINT exchanges_quantity_positive CHECK (quantity > 0);
ALTER TABLE public.products ADD CONSTRAINT products_multipliers_positive
  CHECK (cakes_per_crate > 0 AND crates_per_mix > 0 AND flour_per_mix_kg > 0);
ALTER TABLE public.settings ADD CONSTRAINT settings_prices_positive
  CHECK (retail_price > 0 AND wholesale_price > 0);
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
