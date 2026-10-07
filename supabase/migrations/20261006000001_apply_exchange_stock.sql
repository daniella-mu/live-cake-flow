-- Move customer-exchange stock updates (returned product back to market, replacement
-- deducted from market) into a single atomic trigger, replacing the two separate
-- frontend writes in sales.tsx's logExchange(). Runs AFTER INSERT; raising an exception
-- here rolls back the exchanges insert too, so a rejected exchange never gets saved.
CREATE OR REPLACE FUNCTION public.apply_exchange_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  repl_cakes INT;
BEGIN
  SELECT cakes INTO repl_cakes FROM public.stock
    WHERE product_id = NEW.replacement_product_id AND location = 'market' FOR UPDATE;
  IF repl_cakes IS NULL OR repl_cakes < NEW.quantity THEN
    RAISE EXCEPTION 'Not enough replacement stock at market';
  END IF;

  INSERT INTO public.stock (product_id, location, cakes) VALUES (NEW.returned_product_id, 'market', NEW.quantity)
    ON CONFLICT (product_id, location) DO UPDATE SET cakes = public.stock.cakes + EXCLUDED.cakes, updated_at = now();

  UPDATE public.stock SET cakes = cakes - NEW.quantity, updated_at = now()
    WHERE product_id = NEW.replacement_product_id AND location = 'market';

  RETURN NEW;
END;
$$;

CREATE TRIGGER exchange_stock_trigger AFTER INSERT ON public.exchanges
  FOR EACH ROW EXECUTE FUNCTION public.apply_exchange_stock();
