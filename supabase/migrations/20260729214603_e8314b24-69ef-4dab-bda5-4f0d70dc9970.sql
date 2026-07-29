CREATE TYPE public.recorrencia_freq AS ENUM ('semanal','quinzenal','mensal','bimestral','trimestral','semestral','anual');

ALTER TABLE public.cobrancas
  ADD COLUMN recorrente boolean NOT NULL DEFAULT false,
  ADD COLUMN frequencia public.recorrencia_freq,
  ADD COLUMN recorrencia_fim date,
  ADD COLUMN origem_id uuid REFERENCES public.cobrancas(id) ON DELETE SET NULL,
  ADD COLUMN categoria_id uuid REFERENCES public.categorias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cobrancas_origem_idx ON public.cobrancas(origem_id);
CREATE INDEX IF NOT EXISTS cobrancas_categoria_idx ON public.cobrancas(categoria_id);

CREATE OR REPLACE FUNCTION public.proximo_vencimento(d date, f public.recorrencia_freq)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE f
    WHEN 'semanal' THEN d + INTERVAL '7 days'
    WHEN 'quinzenal' THEN d + INTERVAL '15 days'
    WHEN 'mensal' THEN d + INTERVAL '1 month'
    WHEN 'bimestral' THEN d + INTERVAL '2 months'
    WHEN 'trimestral' THEN d + INTERVAL '3 months'
    WHEN 'semestral' THEN d + INTERVAL '6 months'
    WHEN 'anual' THEN d + INTERVAL '1 year'
  END::date
$$;

CREATE OR REPLACE FUNCTION public.cobranca_pago_movimentacao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cat_nome text;
  prox date;
BEGIN
  IF NEW.status = 'pago' AND (OLD.status IS DISTINCT FROM 'pago') THEN
    SELECT nome INTO cat_nome FROM public.categorias WHERE id = NEW.categoria_id;

    INSERT INTO public.movimentacoes(tipo, valor, descricao, data, cliente_id, cobranca_id, categoria, user_id)
    VALUES ('entrada', NEW.valor, 'Recebimento: ' || NEW.descricao,
            COALESCE(NEW.data_pagamento, CURRENT_DATE), NEW.cliente_id, NEW.id,
            COALESCE(cat_nome, 'Cobrança'), NEW.user_id);

    IF NEW.recorrente AND NEW.frequencia IS NOT NULL THEN
      prox := public.proximo_vencimento(NEW.vencimento, NEW.frequencia);
      IF NEW.recorrencia_fim IS NULL OR prox <= NEW.recorrencia_fim THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.cobrancas c
          WHERE c.origem_id = COALESCE(NEW.origem_id, NEW.id) AND c.vencimento = prox
        ) THEN
          INSERT INTO public.cobrancas(cliente_id, descricao, valor, vencimento, status, observacoes,
                                       user_id, recorrente, frequencia, recorrencia_fim, origem_id, categoria_id)
          VALUES (NEW.cliente_id, NEW.descricao, NEW.valor, prox, 'pendente', NEW.observacoes,
                  NEW.user_id, true, NEW.frequencia, NEW.recorrencia_fim,
                  COALESCE(NEW.origem_id, NEW.id), NEW.categoria_id);
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cobranca_pago ON public.cobrancas;
CREATE TRIGGER trg_cobranca_pago
AFTER UPDATE ON public.cobrancas
FOR EACH ROW EXECUTE FUNCTION public.cobranca_pago_movimentacao();