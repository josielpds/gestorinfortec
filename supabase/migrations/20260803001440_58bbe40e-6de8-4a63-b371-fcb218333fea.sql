CREATE TABLE public.contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  fornecedor text,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  vencimento date NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  pago_em date,
  categoria text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_pagar TO authenticated;
GRANT ALL ON public.contas_pagar TO service_role;

ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contas_pagar" ON public.contas_pagar
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_contas_pagar_updated_at BEFORE UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_contas_pagar_user_venc ON public.contas_pagar(user_id, vencimento);

ALTER TABLE public.movimentacoes ADD COLUMN IF NOT EXISTS conta_pagar_id uuid REFERENCES public.contas_pagar(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.conta_pagar_pago_movimentacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pago' AND (OLD.status IS DISTINCT FROM 'pago') THEN
    INSERT INTO public.movimentacoes (user_id, tipo, valor, descricao, categoria, data, conta_pagar_id)
    VALUES (NEW.user_id, 'saida', NEW.valor, NEW.descricao, NEW.categoria, COALESCE(NEW.pago_em, CURRENT_DATE), NEW.id);
  ELSIF NEW.status <> 'pago' AND OLD.status = 'pago' THEN
    DELETE FROM public.movimentacoes WHERE conta_pagar_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.conta_pagar_pago_movimentacao() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_conta_pagar_pago AFTER UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.conta_pagar_pago_movimentacao();