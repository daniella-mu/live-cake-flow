
-- Roles enum and user_roles table (separate from profiles for security)
CREATE TYPE public.app_role AS ENUM ('admin', 'worker', 'delivery', 'sales');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Security definer to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS SETOF public.app_role
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.user_roles WHERE user_id = _user_id $$;

-- Settings (single row config)
CREATE TABLE public.settings (
  id INT PRIMARY KEY DEFAULT 1,
  retail_price NUMERIC NOT NULL DEFAULT 50,
  wholesale_price NUMERIC NOT NULL DEFAULT 43,
  till_number TEXT NOT NULL DEFAULT '000000',
  cakes_per_crate INT NOT NULL DEFAULT 30,
  crates_per_mix INT NOT NULL DEFAULT 4,
  flour_per_mix_kg NUMERIC NOT NULL DEFAULT 2.5,
  flour_stock_kg NUMERIC NOT NULL DEFAULT 500,
  CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO public.settings (id) VALUES (1);

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  cakes_per_crate INT NOT NULL DEFAULT 30,
  crates_per_mix INT NOT NULL DEFAULT 4,
  flour_per_mix_kg NUMERIC NOT NULL DEFAULT 2.5,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.products (name) VALUES ('Original Cake'), ('Vanilla Cake'), ('Chocolate Cake');

-- Production batches
CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES auth.users(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  mixes INT NOT NULL CHECK (mixes > 0),
  crates_produced INT NOT NULL,
  cakes_produced INT NOT NULL,
  flour_used_kg NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Crate inventory tracker (location: store, transit, market)
CREATE TYPE public.crate_location AS ENUM ('store', 'transit', 'market');

CREATE TABLE public.stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  location public.crate_location NOT NULL,
  cakes INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, location)
);

-- Trips (delivery)
CREATE TYPE public.trip_status AS ENUM ('loading', 'in_transit', 'arrived', 'received', 'completed');

CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_user_id UUID REFERENCES auth.users(id),
  status public.trip_status NOT NULL DEFAULT 'loading',
  departed_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  empty_crates_returned INT,
  broken_cakes INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.trip_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  crates INT NOT NULL,
  cakes INT NOT NULL
);

-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mpesa-style payments (manual entry for now, daraja later)
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id),
  customer_phone TEXT,
  amount NUMERIC NOT NULL,
  reference TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sales
CREATE TYPE public.sale_type AS ENUM ('retail', 'wholesale');

CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_user_id UUID REFERENCES auth.users(id),
  customer_id UUID REFERENCES public.customers(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  cakes INT NOT NULL CHECK (cakes > 0),
  unit_price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  sale_type public.sale_type NOT NULL,
  paid_from_balance BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Worker sessions for time tracking
CREATE TABLE public.work_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_at TIMESTAMPTZ
);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  -- default role = sales (admin must promote)
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'sales');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Stock auto-update on batch insert
CREATE OR REPLACE FUNCTION public.apply_batch_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stock (product_id, location, cakes)
  VALUES (NEW.product_id, 'store', NEW.cakes_produced)
  ON CONFLICT (product_id, location)
  DO UPDATE SET cakes = public.stock.cakes + EXCLUDED.cakes, updated_at = now();

  -- deduct flour silently
  UPDATE public.settings SET flour_stock_kg = flour_stock_kg - NEW.flour_used_kg WHERE id = 1;
  RETURN NEW;
END;
$$;
CREATE TRIGGER batch_stock_trigger AFTER INSERT ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.apply_batch_stock();

-- Stock decrement on sale
CREATE OR REPLACE FUNCTION public.apply_sale_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.stock SET cakes = cakes - NEW.cakes, updated_at = now()
  WHERE product_id = NEW.product_id AND location = 'market';

  IF NEW.paid_from_balance AND NEW.customer_id IS NOT NULL THEN
    UPDATE public.customers SET balance = balance - NEW.total WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sale_stock_trigger AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.apply_sale_stock();

-- Payment increments customer balance
CREATE OR REPLACE FUNCTION public.apply_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE public.customers SET balance = balance + NEW.amount WHERE id = NEW.customer_id;
  ELSIF NEW.customer_phone IS NOT NULL THEN
    UPDATE public.customers SET balance = balance + NEW.amount WHERE phone = NEW.customer_phone;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_trigger AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_payment();

-- Trip transitions: depart moves stock store->transit, received moves transit->market
CREATE OR REPLACE FUNCTION public.apply_trip_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  IF NEW.status = 'in_transit' AND OLD.status = 'loading' THEN
    FOR r IN SELECT * FROM public.trip_items WHERE trip_id = NEW.id LOOP
      UPDATE public.stock SET cakes = cakes - r.cakes, updated_at = now()
        WHERE product_id = r.product_id AND location = 'store';
      INSERT INTO public.stock (product_id, location, cakes) VALUES (r.product_id, 'transit', r.cakes)
        ON CONFLICT (product_id, location) DO UPDATE SET cakes = public.stock.cakes + EXCLUDED.cakes, updated_at = now();
    END LOOP;
  ELSIF NEW.status = 'received' AND OLD.status IN ('arrived','in_transit') THEN
    FOR r IN SELECT * FROM public.trip_items WHERE trip_id = NEW.id LOOP
      UPDATE public.stock SET cakes = cakes - r.cakes, updated_at = now()
        WHERE product_id = r.product_id AND location = 'transit';
      INSERT INTO public.stock (product_id, location, cakes) VALUES (r.product_id, 'market', r.cakes)
        ON CONFLICT (product_id, location) DO UPDATE SET cakes = public.stock.cakes + EXCLUDED.cakes, updated_at = now();
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trip_status_trigger AFTER UPDATE OF status ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.apply_trip_status();

-- ENABLE RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;

-- Policies — authenticated users can read most operational data; writes restricted by role
CREATE POLICY "auth read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "self update profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "auth read user_roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "auth read settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin update settings" ON public.settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "auth read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage products" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "auth read batches" ON public.batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "worker insert batches" ON public.batches FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'worker') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "auth read stock" ON public.stock FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read trips" ON public.trips FOR SELECT TO authenticated USING (true);
CREATE POLICY "delivery insert trips" ON public.trips FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'delivery') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "delivery update trips" ON public.trips FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'delivery') OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "auth read trip_items" ON public.trip_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "delivery insert trip_items" ON public.trip_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'delivery') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "auth read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales manage customers" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "auth read payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales insert payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "auth read sales" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales insert sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "auth read work_sessions" ON public.work_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "self insert session" ON public.work_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "self update session" ON public.work_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.batches, public.stock, public.trips, public.trip_items, public.sales, public.payments, public.customers, public.work_sessions, public.settings;
ALTER TABLE public.batches REPLICA IDENTITY FULL;
ALTER TABLE public.stock REPLICA IDENTITY FULL;
ALTER TABLE public.trips REPLICA IDENTITY FULL;
ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.customers REPLICA IDENTITY FULL;
ALTER TABLE public.work_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.settings REPLICA IDENTITY FULL;
