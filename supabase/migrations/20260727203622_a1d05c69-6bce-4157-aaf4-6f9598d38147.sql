
-- Enum status cobranca
CREATE TYPE public.cobranca_status AS ENUM ('pendente','pago','atrasado','cancelado');
CREATE TYPE public.movimentacao_tipo AS ENUM ('entrada','saida');

-- CLIENTES
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT,
  documento TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO anon, authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_clientes" ON public.clientes FOR ALL USING (true) WITH CHECK (true);

-- COBRANCAS
CREATE TABLE public.cobrancas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  vencimento DATE NOT NULL,
  status public.cobranca_status NOT NULL DEFAULT 'pendente',
  data_pagamento DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cobrancas_cliente_idx ON public.cobrancas(cliente_id);
CREATE INDEX cobrancas_status_idx ON public.cobrancas(status);
CREATE INDEX cobrancas_venc_idx ON public.cobrancas(vencimento);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobrancas TO anon, authenticated;
GRANT ALL ON public.cobrancas TO service_role;
ALTER TABLE public.cobrancas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_cobrancas" ON public.cobrancas FOR ALL USING (true) WITH CHECK (true);

-- MOVIMENTACOES
CREATE TABLE public.movimentacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.movimentacao_tipo NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  descricao TEXT NOT NULL,
  categoria TEXT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cobranca_id UUID REFERENCES public.cobrancas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mov_data_idx ON public.movimentacoes(data);
CREATE INDEX mov_tipo_idx ON public.movimentacoes(tipo);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimentacoes TO anon, authenticated;
GRANT ALL ON public.movimentacoes TO service_role;
ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_mov" ON public.movimentacoes FOR ALL USING (true) WITH CHECK (true);

-- CONFIGURACOES
CREATE TABLE public.configuracoes (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracoes TO anon, authenticated;
GRANT ALL ON public.configuracoes TO service_role;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_cfg" ON public.configuracoes FOR ALL USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_clientes_upd BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cobrancas_upd BEFORE UPDATE ON public.cobrancas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auto-marcar cobranca atrasada quando vencimento passa (via view calculado no app tb)
-- Function to auto-create movimentacao entrada when cobranca marked as pago
CREATE OR REPLACE FUNCTION public.cobranca_pago_movimentacao() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pago' AND (OLD.status IS DISTINCT FROM 'pago') THEN
    INSERT INTO public.movimentacoes(tipo, valor, descricao, data, cliente_id, cobranca_id, categoria)
    VALUES ('entrada', NEW.valor, 'Recebimento: ' || NEW.descricao,
            COALESCE(NEW.data_pagamento, CURRENT_DATE), NEW.cliente_id, NEW.id, 'Cobrança');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_cobranca_pago AFTER UPDATE ON public.cobrancas
FOR EACH ROW EXECUTE FUNCTION public.cobranca_pago_movimentacao();

-- seed configuracoes
INSERT INTO public.configuracoes(key, value) VALUES
('nome_empresa', 'CobraZap'),
('template_cobranca', 'Olá {nome}, você tem uma cobrança de R$ {valor} referente a "{descricao}" com vencimento em {vencimento}. Por favor, efetue o pagamento. Obrigado!'),
('template_atraso', 'Olá {nome}, identificamos que a cobrança de R$ {valor} referente a "{descricao}" está em atraso desde {vencimento}. Por favor, regularize. Obrigado!'),
('template_lembrete', 'Olá {nome}, lembrete: sua cobrança de R$ {valor} vence em {vencimento}. Obrigado!');
