import { supabase } from "@/integrations/supabase/client";

const TABELAS = ["clientes", "cobrancas", "movimentacoes", "categorias", "configuracoes", "profiles"] as const;

/** Baixa um JSON com todos os dados do usuário autenticado. */
export async function baixarBackupCompleto() {
  const dados: Record<string, unknown> = {};
  for (const t of TABELAS) {
    const { data, error } = await supabase.from(t).select("*");
    if (error) throw new Error(`Falha ao exportar ${t}: ${error.message}`);
    dados[t] = data ?? [];
  }

  const payload = {
    app: "CobraZap",
    versao: 1,
    gerado_em: new Date().toISOString(),
    dados,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cobrazap-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  return Object.fromEntries(TABELAS.map((t) => [t, (dados[t] as unknown[]).length]));
}
