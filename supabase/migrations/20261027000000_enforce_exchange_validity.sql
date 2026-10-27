-- An exchange is only valid if the customer actually bought (or previously received
-- via exchange) enough of the returned product within the configured window.
-- Runs BEFORE INSERT; apply_exchange_stock (AFTER INSERT) still moves the stock.
ALTER TABLE public.settings
  ADD COLUMN exchange_window_days INT NOT NULL DEFAULT 5 CHECK (exchange_window_days > 0);

CREATE OR REPLACE FUNCTION public.enforce_exchange_validity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  win INT;
  held INT;
  ever_bought INT;
  product_name TEXT;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RAISE EXCEPTION 'An exchange must be linked to a customer';
  END IF;

  SELECT exchange_window_days INTO win FROM public.settings WHERE id = 1;
  IF win IS NULL THEN
    RAISE EXCEPTION 'Exchange window is not configured';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.customer_id::text));

  SELECT
    COALESCE((SELECT SUM(cakes) FROM public.sales
              WHERE customer_id = NEW.customer_id AND product_id = NEW.returned_product_id
                AND created_at >= now() - make_interval(days => win)), 0)
  + COALESCE((SELECT SUM(quantity) FROM public.exchanges
              WHERE customer_id = NEW.customer_id AND replacement_product_id = NEW.returned_product_id
                AND created_at >= now() - make_interval(days => win)), 0)
  - COALESCE((SELECT SUM(quantity) FROM public.exchanges
              WHERE customer_id = NEW.customer_id AND returned_product_id = NEW.returned_product_id
                AND created_at >= now() - make_interval(days => win)), 0)
  INTO held;

  IF held < NEW.quantity THEN
    SELECT name INTO product_name FROM public.products WHERE id = NEW.returned_product_id;

    IF held <= 0 THEN
      SELECT COALESCE(SUM(cakes), 0) INTO ever_bought FROM public.sales
        WHERE customer_id = NEW.customer_id AND product_id = NEW.returned_product_id;
      IF ever_bought > 0 THEN
        RAISE EXCEPTION 'Customer bought % more than % days ago — too late to exchange it', product_name, win;
      ELSE
        RAISE EXCEPTION 'Customer has not bought % recently — nothing to exchange', product_name;
      END IF;
    ELSE
      RAISE EXCEPTION 'Customer only has % left to exchange from recent purchases of %', held, product_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_exchange_validity_trigger BEFORE INSERT ON public.exchanges
  FOR EACH ROW EXECUTE FUNCTION public.enforce_exchange_validity();
