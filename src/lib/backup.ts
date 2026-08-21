import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/hooks/useCurrentUser";

const TABELAS = ["clientes", "cobrancas", "contas_pagar", "movimentacoes", "categorias", "configuracoes", "profiles"] as const;

export type BackupSummary = {
  clientes: number;
  cobrancas: number;
  contas_pagar: number;
  movimentacoes: number;
  categorias: number;
  configuracoes: number;
  profiles: number;
  total: number;
  gerado_em?: string;
  versao?: number;
};

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

/** Lê um arquivo File de backup e retorna a contagem de registros para pré-visualização. */
export async function analisarArquivoBackup(file: File): Promise<{
  payload: any;
  summary: BackupSummary;
}> {
  const text = await file.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("O arquivo selecionado não é um JSON válido.");
  }

  const dados = json.dados || json;
  if (!dados || typeof dados !== "object") {
    throw new Error("Estrutura do arquivo de backup incompatível.");
  }

  const summary: BackupSummary = {
    clientes: Array.isArray(dados.clientes) ? dados.clientes.length : 0,
    cobrancas: Array.isArray(dados.cobrancas) ? dados.cobrancas.length : 0,
    contas_pagar: Array.isArray(dados.contas_pagar) ? dados.contas_pagar.length : 0,
    movimentacoes: Array.isArray(dados.movimentacoes) ? dados.movimentacoes.length : 0,
    categorias: Array.isArray(dados.categorias) ? dados.categorias.length : 0,
    configuracoes: Array.isArray(dados.configuracoes) ? dados.configuracoes.length : 0,
    profiles: Array.isArray(dados.profiles) ? dados.profiles.length : 0,
    total: 0,
    gerado_em: json.gerado_em,
    versao: json.versao,
  };

  summary.total =
    summary.clientes +
    summary.cobrancas +
    summary.contas_pagar +
    summary.movimentacoes +
    summary.categorias +
    summary.configuracoes +
    summary.profiles;

  return { payload: dados, summary };
}

/** Restaura o backup para o usuário autenticado respeitando chaves estrangeiras e RLS. */
export async function restaurarBackupCompleto(dados: Record<string, any[]>): Promise<BackupSummary> {
  const user_id = await currentUserId();
  const summary: BackupSummary = {
    clientes: 0,
    cobrancas: 0,
    contas_pagar: 0,
    movimentacoes: 0,
    categorias: 0,
    configuracoes: 0,
    profiles: 0,
    total: 0,
  };

  // 1. Profiles (atualiza perfil do usuário atual se vier no backup)
  if (Array.isArray(dados.profiles) && dados.profiles.length > 0) {
    const p = dados.profiles[0];
    if (p) {
      const { error } = await supabase.from("profiles").upsert(
        {
          id: user_id,
          nome: p.nome ?? null,
          empresa: p.empresa ?? null,
        },
        { onConflict: "id" }
      );
      if (!error) summary.profiles++;
    }
  }

  // 2. Configurações
  if (Array.isArray(dados.configuracoes) && dados.configuracoes.length > 0) {
    const cfgs = dados.configuracoes
      .filter((c: any) => c && c.key)
      .map((c: any) => ({
        user_id,
        key: c.key,
        value: c.value ?? null,
      }));
    if (cfgs.length > 0) {
      const { error } = await supabase.from("configuracoes").upsert(cfgs, { onConflict: "user_id,key" });
      if (error) throw new Error(`Erro ao restaurar configurações: ${error.message}`);
      summary.configuracoes = cfgs.length;
    }
  }

  // 3. Categorias
  if (Array.isArray(dados.categorias) && dados.categorias.length > 0) {
    const cats = dados.categorias
      .filter((c: any) => c && c.nome && c.tipo)
      .map((c: any) => ({
        ...(c.id ? { id: c.id } : {}),
        user_id,
        nome: c.nome,
        tipo: c.tipo,
      }));
    if (cats.length > 0) {
      const { error } = await supabase.from("categorias").upsert(cats, { onConflict: "user_id,nome,tipo" });
      if (error) {
        const catsSemId = cats.map(({ id, ...rest }) => rest);
        const { error: e2 } = await supabase.from("categorias").upsert(catsSemId, { onConflict: "user_id,nome,tipo" });
        if (e2) throw new Error(`Erro ao restaurar categorias: ${e2.message}`);
      }
      summary.categorias = cats.length;
    }
  }

  // 4. Clientes
  if (Array.isArray(dados.clientes) && dados.clientes.length > 0) {
    const clis = dados.clientes
      .filter((c: any) => c && c.nome && c.telefone)
      .map((c: any) => ({
        ...(c.id ? { id: c.id } : {}),
        user_id,
        nome: c.nome,
        telefone: c.telefone,
        email: c.email ?? null,
        documento: c.documento ?? null,
        observacoes: c.observacoes ?? null,
        ativo: c.ativo !== undefined ? c.ativo : true,
      }));
    if (clis.length > 0) {
      const { error } = await supabase.from("clientes").upsert(clis, { onConflict: "id" });
      if (error) throw new Error(`Erro ao restaurar clientes: ${error.message}`);
      summary.clientes = clis.length;
    }
  }

  // 5. Cobranças
  if (Array.isArray(dados.cobrancas) && dados.cobrancas.length > 0) {
    const cobs = dados.cobrancas
      .filter((c: any) => c && c.cliente_id && c.descricao && c.vencimento)
      .map((c: any) => ({
        ...(c.id ? { id: c.id } : {}),
        user_id,
        cliente_id: c.cliente_id,
        categoria_id: c.categoria_id ?? null,
        descricao: c.descricao,
        valor: Number(c.valor) || 0,
        vencimento: c.vencimento,
        status: c.status || "pendente",
        data_pagamento: c.data_pagamento ?? null,
        observacoes: c.observacoes ?? null,
        recorrente: !!c.recorrente,
        frequencia: c.frequencia ?? null,
        recorrencia_fim: c.recorrencia_fim ?? null,
        origem_id: c.origem_id ?? null,
      }));
    if (cobs.length > 0) {
      const { error } = await supabase.from("cobrancas").upsert(cobs, { onConflict: "id" });
      if (error) throw new Error(`Erro ao restaurar cobranças: ${error.message}`);
      summary.cobrancas = cobs.length;
    }
  }

  // 6. Contas a Pagar
  if (Array.isArray(dados.contas_pagar) && dados.contas_pagar.length > 0) {
    const cp = dados.contas_pagar
      .filter((c: any) => c && c.descricao && c.vencimento)
      .map((c: any) => ({
        ...(c.id ? { id: c.id } : {}),
        user_id,
        descricao: c.descricao,
        fornecedor: c.fornecedor ?? null,
        valor: Number(c.valor) || 0,
        vencimento: c.vencimento,
        status: c.status || "pendente",
        pago_em: c.pago_em ?? null,
        categoria: c.categoria ?? null,
        observacoes: c.observacoes ?? null,
      }));
    if (cp.length > 0) {
      const { error } = await supabase.from("contas_pagar").upsert(cp, { onConflict: "id" });
      if (error) throw new Error(`Erro ao restaurar contas a pagar: ${error.message}`);
      summary.contas_pagar = cp.length;
    }
  }

  // 7. Movimentações
  if (Array.isArray(dados.movimentacoes) && dados.movimentacoes.length > 0) {
    let movs = dados.movimentacoes
      .filter((m: any) => m && m.descricao && m.tipo)
      .map((m: any) => ({
        ...(m.id ? { id: m.id } : {}),
        user_id,
        tipo: m.tipo,
        status: m.status || "pago",
        valor: Number(m.valor) || 0,
        descricao: m.descricao,
        data: m.data || new Date().toISOString().slice(0, 10),
        categoria: m.categoria ?? null,
        cliente_id: m.cliente_id ?? null,
        cobranca_id: m.cobranca_id ?? null,
        conta_pagar_id: m.conta_pagar_id ?? null,
        ...(m.observacoes ? { observacoes: m.observacoes } : {}),
      }));

    if (movs.length > 0) {
      let restored = false;
      const maxAttempts = 4;
      for (let attempt = 0; attempt < maxAttempts && !restored; attempt++) {
        const { error } = await supabase.from("movimentacoes").upsert(movs, { onConflict: "id" });
        if (!error) {
          restored = true;
          summary.movimentacoes = movs.length;
          break;
        }

        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1]) {
          const col = match[1];
          movs = movs.map((item: any) => {
            const copy = { ...item };
            delete copy[col];
            return copy;
          });
          continue;
        }

        throw new Error(`Erro ao restaurar movimentações: ${error.message}`);
      }
    }
  }

  summary.total =
    summary.clientes +
    summary.cobrancas +
    summary.contas_pagar +
    summary.movimentacoes +
    summary.categorias +
    summary.configuracoes +
    summary.profiles;

  return summary;
}
