-- Permite editar observações em movimentações (entrada/saída manual)
ALTER TABLE public.movimentacoes ADD COLUMN IF NOT EXISTS observacoes text;
