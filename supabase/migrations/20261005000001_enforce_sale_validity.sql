-- Validate sales server-side: price is derived from settings (unit_price and
-- total are overwritten), and the sale is rejected if market stock or customer
-- balance would go negative. Runs BEFORE INSERT so it can rewrite or reject the
-- row; apply_sale_stock (AFTER INSERT) still performs the deductions.
CREATE OR REPLACE FUNCTION public.enforce_sale_validity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  price NUMERIC;
  avail_cakes INT;
  cust_balance NUMERIC;
BEGIN
  SELECT CASE WHEN NEW.sale_type = 'retail' THEN retail_price ELSE wholesale_price END
    INTO price FROM public.settings WHERE id = 1;
  NEW.unit_price := price;
  NEW.total := price * NEW.cakes;

  SELECT cakes INTO avail_cakes FROM public.stock
    WHERE product_id = NEW.product_id AND location = 'market' FOR UPDATE;
  IF avail_cakes IS NULL OR avail_cakes < NEW.cakes THEN
    RAISE EXCEPTION 'Not enough stock at market';
  END IF;

  IF NEW.paid_from_balance AND NEW.customer_id IS NOT NULL THEN
    SELECT balance INTO cust_balance FROM public.customers
      WHERE id = NEW.customer_id FOR UPDATE;
    IF cust_balance IS NULL OR cust_balance < NEW.total THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_sale_validity_trigger BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_validity();
