CREATE TYPE public.app_role AS ENUM ('master','user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_roles_master_select" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'master'));
CREATE POLICY "user_roles_master_insert" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'master'));
CREATE POLICY "user_roles_master_update" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'master')) WITH CHECK (public.has_role(auth.uid(),'master'));
CREATE POLICY "user_roles_master_delete" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'master'));

ALTER TABLE public.profiles
  ADD COLUMN bloqueado boolean NOT NULL DEFAULT false,
  ADD COLUMN plano text NOT NULL DEFAULT 'free',
  ADD COLUMN assinatura_status text NOT NULL DEFAULT 'trial',
  ADD COLUMN assinatura_expira date,
  ADD COLUMN email text;

CREATE POLICY "profiles_master_select" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'master'));
CREATE POLICY "profiles_master_update" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'master')) WITH CHECK (public.has_role(auth.uid(),'master'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, nome, empresa, email, assinatura_status, assinatura_expira)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', ''), COALESCE(NEW.raw_user_meta_data->>'empresa', ''), NEW.email, 'trial', (CURRENT_DATE + 14));

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;

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
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'user' FROM auth.users ON CONFLICT DO NOTHING;

UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE u.id = p.id AND p.email IS NULL;