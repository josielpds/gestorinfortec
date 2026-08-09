ALTER TABLE public.movimentacoes ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pago';
ALTER TABLE public.movimentacoes ADD CONSTRAINT movimentacoes_status_check CHECK (status IN ('pago', 'pendente'));
CREATE INDEX IF NOT EXISTS mov_status_idx ON public.movimentacoes(status);
