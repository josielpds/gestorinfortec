
-- Wipe existing data (order matters due to FKs)
DELETE FROM public.movimentacoes;
DELETE FROM public.cobrancas;
DELETE FROM public.clientes;
DELETE FROM public.configuracoes;

-- Drop old permissive policies
DROP POLICY IF EXISTS public_all_clientes ON public.clientes;
DROP POLICY IF EXISTS public_all_cobrancas ON public.cobrancas;
DROP POLICY IF EXISTS public_all_mov ON public.movimentacoes;
DROP POLICY IF EXISTS public_all_cfg ON public.configuracoes;

-- Add user_id to existing tables
ALTER TABLE public.clientes ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.cobrancas ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.movimentacoes ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

-- configuracoes: switch to per-user keyed by (user_id, key)
ALTER TABLE public.configuracoes DROP CONSTRAINT IF EXISTS configuracoes_pkey;
ALTER TABLE public.configuracoes ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.configuracoes ADD PRIMARY KEY (user_id, key);

CREATE INDEX idx_clientes_user ON public.clientes(user_id);
CREATE INDEX idx_cobrancas_user ON public.cobrancas(user_id);
CREATE INDEX idx_movimentacoes_user ON public.movimentacoes(user_id);

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text,
  empresa text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_own ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Categorias (custom, per user)
CREATE TABLE public.categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo public.movimentacao_tipo NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nome, tipo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias TO authenticated;
GRANT ALL ON public.categorias TO service_role;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY categorias_own ON public.categorias FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_categorias_user ON public.categorias(user_id);

-- RLS on existing tables
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobrancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY clientes_own ON public.clientes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY cobrancas_own ON public.cobrancas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY movimentacoes_own ON public.movimentacoes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY configuracoes_own ON public.configuracoes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Update paid-bill trigger to include user_id
CREATE OR REPLACE FUNCTION public.cobranca_pago_movimentacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'pago' AND (OLD.status IS DISTINCT FROM 'pago') THEN
    INSERT INTO public.movimentacoes(tipo, valor, descricao, data, cliente_id, cobranca_id, categoria, user_id)
    VALUES ('entrada', NEW.valor, 'Recebimento: ' || NEW.descricao,
            COALESCE(NEW.data_pagamento, CURRENT_DATE), NEW.cliente_id, NEW.id, 'Cobrança', NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cobranca_pago ON public.cobrancas;
CREATE TRIGGER trg_cobranca_pago
AFTER UPDATE ON public.cobrancas
FOR EACH ROW EXECUTE FUNCTION public.cobranca_pago_movimentacao();

-- On new user: create profile, default configs, default categorias
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, empresa)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', ''), COALESCE(NEW.raw_user_meta_data->>'empresa', ''));

  INSERT INTO public.configuracoes (user_id, key, value) VALUES
    (NEW.id, 'nome_empresa', COALESCE(NEW.raw_user_meta_data->>'empresa', 'Minha Empresa')),
    (NEW.id, 'template_cobranca', 'Olá {nome}! Você tem uma cobrança de R$ {valor} ({descricao}) com vencimento em {vencimento}. Qualquer dúvida, estou à disposição.'),
    (NEW.id, 'template_atraso', 'Olá {nome}, notamos que a cobrança de R$ {valor} ({descricao}) venceu em {vencimento} e ainda consta em aberto. Poderia regularizar?'),
    (NEW.id, 'template_lembrete', 'Oi {nome}! Passando para lembrar que sua cobrança de R$ {valor} ({descricao}) vence em {vencimento}. Obrigado!');

  INSERT INTO public.categorias (user_id, nome, tipo) VALUES
    (NEW.id, 'Cobrança', 'entrada'),
    (NEW.id, 'Venda', 'entrada'),
    (NEW.id, 'Serviço', 'entrada'),
    (NEW.id, 'Outro', 'entrada'),
    (NEW.id, 'Fornecedor', 'saida'),
    (NEW.id, 'Salário', 'saida'),
    (NEW.id, 'Aluguel', 'saida'),
    (NEW.id, 'Impostos', 'saida'),
    (NEW.id, 'Marketing', 'saida'),
    (NEW.id, 'Outro', 'saida');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
