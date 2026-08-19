import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/hooks/useCurrentUser";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Check, Send, Repeat, Pencil, CalendarPlus, CircleSlash, ChevronRight, ChevronDown, Upload, Search, CalendarRange } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { brl, fmtDate, effectiveStatus, todayISO } from "@/lib/format";
import { waLink, renderTemplate } from "@/lib/whatsapp";
import { FREQ_LABEL, gerarDatas, quantidadeParaFim, fimParaQuantidade } from "@/lib/recorrencia";
import { BulkImportDialog } from "@/components/BulkImportDialog";
import { parseDelimited, parseValor, parseDate, norm } from "@/lib/import";

export const Route = createFileRoute("/_authenticated/cobrancas")({
  head: () => ({ meta: [{ title: "Contas a Receber — CobraZap" }, { name: "description", content: "Cadastro e gestão das contas a receber dos seus clientes." }] }),
  component: CobrancasPage,
});

import { MonthFilter, formatMonthLabel } from "@/components/MonthFilter";

type Cobranca = {
  id: string; cliente_id: string; descricao: string; valor: number;
  vencimento: string; status: string; data_pagamento: string | null;
  observacoes?: string | null;
  recorrente?: boolean; frequencia?: string | null; recorrencia_fim?: string | null; categoria_id?: string | null; origem_id?: string | null;
  clientes?: { nome: string; telefone: string };
  categorias?: { nome: string } | null;
};

function CobrancasPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cobranca | null>(null);
  const [gerando, setGerando] = useState<Cobranca | null>(null);
  const [filter, setFilter] = useState<string>("todos");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => todayISO().slice(0, 7));
  const [expandido, setExpandido] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: cobrancas = [] } = useQuery({
    queryKey: ["cobrancas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cobrancas")
        .select("*, clientes(nome, telefone), categorias(nome)").order("vencimento");
      if (error) throw error;
      return data as unknown as Cobranca[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-list"],
    queryFn: async () => (await supabase.from("clientes").select("id, nome, telefone").eq("ativo", true).order("nome")).data ?? [],
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias-entrada"],
    queryFn: async () => (await supabase.from("categorias").select("id, nome").eq("tipo", "entrada").order("nome")).data ?? [],
  });

  const { data: tplRow } = useQuery({
    queryKey: ["cfg", "template_cobranca"],
    queryFn: async () => (await supabase.from("configuracoes").select("value").eq("key", "template_cobranca").maybeSingle()).data,
  });

  const create = useMutation({
    mutationFn: async (p: any) => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("cobrancas").insert({ ...p, user_id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cobrança criada"); qc.invalidateQueries(); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkImport = useMutation({
    mutationFn: async (rows: any[]) => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("cobrancas").insert(rows.map((r) => ({ ...r, user_id })));
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} cobrança(s) importada(s)`);
      qc.invalidateQueries();
      setImportOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const parseCobrancas = (rows: string[][]) => {
    const skipHeader = rows[0]?.[0]?.toLowerCase().includes("cliente");
    const data = skipHeader ? rows.slice(1) : rows;
    const clienteById = new Map<string, string>();
    for (const c of clientes) clienteById.set(norm(c.nome), c.id);
    const catById = new Map<string, string>();
    for (const c of categorias) catById.set(norm(c.nome), c.id);
    const valid: any[] = [];
    const reasons: string[] = [];
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const num = i + (skipHeader ? 2 : 1);
      const clienteNome = (r[0] ?? "").trim();
      const descricao = (r[1] ?? "").trim();
      const valor = parseValor(r[2] ?? "");
      const vencimento = parseDate(r[3] ?? "");
      const categoriaNome = (r[4] ?? "").trim();
      const observacoes = (r[5] ?? "").trim();
      const frequencia = (r[6] ?? "").trim().toLowerCase();
      const qtd = parseInt((r[7] ?? "").trim(), 10) || 0;
      const cliente_id = clienteById.get(norm(clienteNome));
      if (!cliente_id) { reasons.push(`Linha ${num}: cliente "${clienteNome || "(vazio)"}" não encontrado — cadastre ou importe o cliente antes.`); continue; }
      if (!descricao) { reasons.push(`Linha ${num}: descrição vazia.`); continue; }
      if (valor === null || valor <= 0) { reasons.push(`Linha ${num}: valor inválido ("${(r[2] ?? "").trim()}").`); continue; }
      if (!vencimento) { reasons.push(`Linha ${num}: vencimento inválido ("${(r[3] ?? "").trim()}"). Use formato dd/mm/aaaa ou aaaa-mm-dd.`); continue; }
      if (frequencia && !FREQ_LABEL[frequencia]) { reasons.push(`Linha ${num}: frequência desconhecida ("${(r[6] ?? "").trim()}"). Use semanal, quinzenal, mensal, bimestral, trimestral, semestral ou anual.`); continue; }
      const recorrente = !!frequencia;
      const fim = recorrente && qtd > 0 ? quantidadeParaFim(vencimento, frequencia, qtd) : null;
      valid.push({
        cliente_id,
        descricao,
        valor,
        vencimento,
        categoria_id: catById.get(norm(categoriaNome)) ?? null,
        observacoes: observacoes || null,
        recorrente,
        frequencia: frequencia || null,
        recorrencia_fim: fim,
      });
    }
    return { valid, skipped: reasons.length, reasons };
  };

  const update = useMutation({
    mutationFn: async ({ id, ...p }: any) => {
      const { error } = await supabase.from("cobrancas").update(p).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cobrança atualizada"); qc.invalidateQueries(); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const encerrarRecorrencia = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cobrancas")
        .update({ recorrente: false, frequencia: null, recorrencia_fim: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Recorrência encerrada — esta cobrança não gera mais parcelas"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const gerarParcelas = useMutation({
    mutationFn: async ({ c, qtd }: { c: Cobranca; qtd: number }) => {
      const user_id = await currentUserId();
      const datas = gerarDatas(c.vencimento, c.frequencia ?? "mensal", qtd, c.recorrencia_fim ?? null);
      if (datas.length === 0) throw new Error("Nenhuma parcela a gerar (limite da recorrência atingido).");
      const rows = datas.map((v, i) => ({
        user_id,
        cliente_id: c.cliente_id,
        descricao: c.descricao,
        valor: c.valor,
        vencimento: v,
        observacoes: c.observacoes ?? null,
        categoria_id: c.categoria_id ?? null,
        origem_id: c.id,
        // apenas a última parcela mantém a recorrência ativa, evitando duplicidade
        recorrente: i === datas.length - 1,
        frequencia: i === datas.length - 1 ? c.frequencia : null,
        recorrencia_fim: i === datas.length - 1 ? c.recorrencia_fim ?? null : null,
      }));
      const { error } = await supabase.from("cobrancas").insert(rows as any);
      if (error) throw error;
      const { error: e2 } = await supabase.from("cobrancas")
        .update({ recorrente: false, frequencia: null, recorrencia_fim: null }).eq("id", c.id);
      if (e2) throw e2;
      return datas.length;
    },
    onSuccess: (n) => { toast.success(`${n} parcela(s) gerada(s)`); qc.invalidateQueries(); setGerando(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const marcarPago = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cobrancas").update({ status: "pago", data_pagamento: todayISO() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cobrança marcada como paga"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("cobrancas").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Cobrança excluída"); qc.invalidateQueries(); },
  });

  const renderLinha = (c: Cobranca, filha: boolean) => {
    const st = effectiveStatus(c.vencimento, c.status);
    return (
      <tr key={c.id} className={filha ? "bg-background/50 hover:bg-muted/30 text-sm" : "hover:bg-muted/30"}>
        <td className={"px-4 py-3 font-medium" + (filha ? " pl-10 text-muted-foreground" : "")}>
          {filha ? "" : c.clientes?.nome ?? "—"}
        </td>
        <td className={"px-4 py-3" + (filha ? " pl-10" : "")}>
          <div className="flex items-center gap-2">
            {filha ? <span className="text-muted-foreground">{c.descricao}</span> : c.descricao}
            {!filha && c.recorrente && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1">
                <Repeat className="h-3 w-3" /> {FREQ_LABEL[c.frequencia ?? ""] ?? "Recorrente"}
              </Badge>
            )}
          </div>
          {!filha && c.recorrente && c.recorrencia_fim && (
            <div className="text-xs text-muted-foreground mt-1">até {fmtDate(c.recorrencia_fim)}</div>
          )}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{c.categorias?.nome ?? "—"}</td>
        <td className="px-4 py-3 text-right font-semibold">{brl(c.valor)}</td>
        <td className="px-4 py-3">{fmtDate(c.vencimento)}</td>
        <td className="px-4 py-3"><StatusBadge status={st} /></td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {c.status !== "pago" && (
            <>
              <Button size="sm" variant="ghost" title="Enviar WhatsApp" onClick={() => {
                const msg = renderTemplate(tplRow?.value ?? "Olá {nome}, cobrança de R$ {valor}.", {
                  nome: c.clientes?.nome ?? "", valor: c.valor, descricao: c.descricao, vencimento: c.vencimento,
                });
                window.open(waLink(c.clientes?.telefone ?? "", msg), "_blank");
              }}><Send className="h-4 w-4 text-primary" /></Button>
              <Button size="sm" variant="ghost" title="Dar baixa (marcar como pago)" onClick={() => marcarPago.mutate(c.id)}>
                <Check className="h-4 w-4 text-success" />
              </Button>
              <Button size="sm" variant="ghost" title="Editar" onClick={() => setEditing(c)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
          {c.recorrente && (
            <>
              <Button size="sm" variant="ghost" title="Gerar próximas parcelas" onClick={() => setGerando(c)}>
                <CalendarPlus className="h-4 w-4 text-primary" />
              </Button>
              <Button size="sm" variant="ghost" title="Encerrar recorrência" onClick={() => {
                if (confirm("Encerrar a recorrência desta cobrança? As parcelas já criadas continuam.")) encerrarRecorrencia.mutate(c.id);
              }}><CircleSlash className="h-4 w-4 text-muted-foreground" /></Button>
            </>
          )}
          <Button size="sm" variant="ghost" title="Excluir" onClick={() => { if (confirm("Excluir?")) remove.mutate(c.id); }}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </td>
      </tr>
    );
  };

  const isMonthAll = selectedMonth === "todos";

  const cobrancasDoMes = isMonthAll
    ? cobrancas
    : cobrancas.filter((c) => (c.vencimento ?? "").startsWith(selectedMonth) || (c.data_pagamento ?? "").startsWith(selectedMonth));

  const filtered = cobrancasDoMes.filter((c) => {
    if (filter === "todos") return true;
    if (filter === "recorrente") return !!c.recorrente || !!c.origem_id;
    return effectiveStatus(c.vencimento, c.status) === filter;
  });

  // Agrupa as cobranças por cliente
  const grupos: { cliente_id: string; nome: string; itens: Cobranca[] }[] = [];
  const idxCliente = new Map<string, number>();
  for (const c of filtered) {
    if (!idxCliente.has(c.cliente_id)) {
      idxCliente.set(c.cliente_id, grupos.length);
      grupos.push({ cliente_id: c.cliente_id, nome: c.clientes?.nome ?? "—", itens: [] });
    }
    grupos[idxCliente.get(c.cliente_id)!].itens.push(c);
  }

  const hojeYM = todayISO().slice(0, 7);

  const resumoCliente = (g: { cliente_id: string; itens: Cobranca[] }) => {
    const todas = cobrancas.filter((c) => c.cliente_id === g.cliente_id);
    const abertas = todas.filter((c) => ["pendente", "atrasado"].includes(effectiveStatus(c.vencimento, c.status)));
    const pagas = todas.filter((c) => c.status === "pago");
    const meses = new Set<string>();
    for (const c of abertas) {
      if (c.recorrente && c.recorrencia_fim) {
        let [y, m] = c.vencimento.split("-").map(Number);
        while (true) {
          const ym = `${y}-${String(m).padStart(2, "0")}`;
          if (ym > hojeYM) meses.add(ym);
          if (ym >= c.recorrencia_fim.slice(0, 7)) break;
          m++;
          if (m > 12) { m = 1; y++; }
        }
      } else {
        const ym = c.vencimento.slice(0, 7);
        if (ym > hojeYM) meses.add(ym);
      }
    }
    const abertasOrdenadas = [...abertas].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    return {
      abertas,
      pagas,
      totalAberto: abertas.reduce((s, c) => s + Number(c.valor), 0),
      proxima: abertasOrdenadas[0] ?? null,
      mesesFuturos: meses.size,
    };
  };

  const somenteAberto = filter === "todos";
  const q = search.trim().toLowerCase();
  const clientesFiltrados = grupos
    .map((g) => ({ grupo: g, resumo: resumoCliente(g) }))
    .filter(({ resumo }) => !somenteAberto || resumo.abertas.length > 0)
    .filter(({ grupo }) => !q || grupo.nome.toLowerCase().includes(q))
    .sort((a, b) => a.grupo.nome.localeCompare(b.grupo.nome));

  const recebidoMes = cobrancasDoMes
    .filter((c) => c.status === "pago")
    .reduce((s, c) => s + Number(c.valor), 0);
  const aReceberMes = cobrancasDoMes
    .filter((c) => c.status === "pendente")
    .reduce((s, c) => s + Number(c.valor), 0);
  const previsao = cobrancas
    .filter((c) => c.status === "pendente" && (!isMonthAll ? c.vencimento.slice(0, 7) > selectedMonth : true))
    .reduce((s, c) => s + Number(c.valor), 0);

  const proximosMeses = (() => {
    const out: { key: string; mes: string; total: number }[] = [];
    const baseYM = isMonthAll ? todayISO().slice(0, 7) : selectedMonth;
    const [y, m] = baseYM.split("-").map(Number);
    const base = new Date(y, m - 1, 1);
    for (let i = 1; i <= 6; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const total = cobrancas
        .filter((c) => c.status === "pendente" && c.vencimento.slice(0, 7) === key)
        .reduce((s, c) => s + Number(c.valor), 0);
      out.push({ key, mes: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), total });
    }
    return out;
  })();

  return (
    <AppLayout>
      <div className="p-8 max-w-[1400px]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <PageHeader
            title="Contas a Receber"
            subtitle={`Gerencie as cobranças e mensalidades dos seus clientes — ${formatMonthLabel(selectedMonth)}`}
            action={
              <div className="flex gap-2">
                <Dialog open={importOpen} onOpenChange={setImportOpen}>
                  <DialogTrigger asChild><Button variant="outline" disabled={clientes.length === 0}><Upload className="h-4 w-4 mr-2" /> Importar em massa</Button></DialogTrigger>
                  <BulkImportDialog
                    title="Importar cobranças em massa"
                    description="Baixe o modelo, preencha com suas cobranças e importe. O cliente e a categoria devem existir no sistema (serão buscados pelo nome). Vencimento aceita dd/mm/aaaa ou aaaa-mm-dd. Preencha frequencia e quantidade para criar uma mensalidade/recorrência."
                    templateName="cobrancas-modelo.csv"
                    columns={[
                      { key: "cliente", label: "cliente", example: "MERCADINHO CANARIO" },
                      { key: "descricao", label: "descricao", example: "Mensalidade" },
                      { key: "valor", label: "valor", example: "150,00" },
                      { key: "vencimento", label: "vencimento", example: "2026-08-15" },
                      { key: "categoria", label: "categoria", example: "Mensalidade" },
                      { key: "observacoes", label: "observacoes", example: "" },
                      { key: "frequencia", label: "frequencia", example: "mensal" },
                      { key: "quantidade", label: "quantidade", example: "12" },
                    ]}
                    parse={parseCobrancas}
                    onSubmit={(rows) => bulkImport.mutate(rows)}
                    loading={bulkImport.isPending}
                    itemLabel="cobrança"
                  />
                </Dialog>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild><Button disabled={clientes.length === 0}><Plus className="h-4 w-4 mr-2" /> Nova Cobrança</Button></DialogTrigger>
                  <CobrancaForm clientes={clientes as any} categorias={categorias as any} onSubmit={(p) => create.mutate(p)} loading={create.isPending} />
                </Dialog>
              </div>
            }
          />
          <MonthFilter selectedMonth={selectedMonth} onChange={setSelectedMonth} allowAll={true} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <Card><CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Recebido no período</p>
            <p className="text-2xl font-bold text-success mt-1">{brl(recebidoMes)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">A receber no período</p>
            <p className="text-2xl font-bold mt-1">{brl(aReceberMes)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Previsão meses seguintes</p>
            <p className="text-2xl font-bold text-primary mt-1">{brl(previsao)}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
              {proximosMeses.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setSelectedMonth(m.key)}
                  className="hover:underline text-left cursor-pointer"
                >
                  {m.mes}: <span className="font-medium text-foreground">{brl(m.total)}</span>
                </button>
              ))}
            </div>
          </CardContent></Card>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap gap-2">
            {["todos", "pendente", "atrasado", "pago", "cancelado", "recorrente"].map((s) => (
              <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
                {s === "todos" ? "Todas" : s === "recorrente" ? "Mensalidades" : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar cliente com cobrança..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {clientesFiltrados.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                {clientes.length === 0
                  ? "Cadastre um cliente antes de criar cobranças"
                  : q
                    ? "Nenhum cliente encontrado para a busca"
                    : filter === "todos"
                      ? "Nenhum cliente com cobrança em aberto"
                      : "Nenhum cliente encontrado"}
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Cliente</th>
                    <th className="text-left px-4 py-3">Descrição</th>
                    <th className="text-left px-4 py-3">Categoria</th>
                    <th className="text-right px-4 py-3">Valor</th>
                    <th className="text-left px-4 py-3">Vencimento</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {clientesFiltrados.map(({ grupo, resumo }) => {
                    const key = `cli:${grupo.cliente_id}`;
                    const aberto = expandido === key;
                    const ordenadas = [...grupo.itens].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
                    const proxima = resumo.proxima;
                    return (
                      <Fragment key={grupo.cliente_id}>
                        <tr className="bg-muted/20 hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">
                            <button className="flex items-center gap-2 text-left" onClick={() => setExpandido(aberto ? null : key)}>
                              {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <span>{grupo.nome}</span>
                            </button>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1 ml-6">
                              {resumo.mesesFuturos > 0 && (
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1">
                                  <CalendarRange className="h-3 w-3" />
                                  {resumo.mesesFuturos} {resumo.mesesFuturos === 1 ? "mês" : "meses"} futuros
                                </Badge>
                              )}
                              <span>
                                {resumo.abertas.length} em aberto · {resumo.pagas.length} paga(s)
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {resumo.mesesFuturos > 0
                              ? `${resumo.mesesFuturos} ${resumo.mesesFuturos === 1 ? "mês" : "meses"} programado(s)`
                              : "Sem programação futura"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{proxima?.categorias?.nome ?? "—"}</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {brl(resumo.totalAberto)}
                            <div className="text-xs font-normal text-muted-foreground">em aberto</div>
                          </td>
                          <td className="px-4 py-3">{proxima ? fmtDate(proxima.vencimento) : "—"}</td>
                          <td className="px-4 py-3">
                            {proxima ? <StatusBadge status={effectiveStatus(proxima.vencimento, proxima.status)} /> : <StatusBadge status="pago" />}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {proxima && (
                              <Button size="sm" variant="ghost" title="Dar baixa na próxima cobrança" onClick={() => marcarPago.mutate(proxima.id)}>
                                <Check className="h-4 w-4 text-success" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" title={aberto ? "Ocultar cobranças" : "Ver cobranças"} onClick={() => setExpandido(aberto ? null : key)}>
                              {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </td>
                        </tr>
                        {aberto && ordenadas.map((c) => renderLinha(c, true))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>


      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && (
          <CobrancaForm
            clientes={clientes as any}
            categorias={categorias as any}
            initial={editing}
            loading={update.isPending}
            onSubmit={(p) => update.mutate({ id: editing.id, ...p })}
          />
        )}
      </Dialog>

      <Dialog open={!!gerando} onOpenChange={(v) => !v && setGerando(null)}>
        {gerando && (
          <GerarParcelasForm
            cobranca={gerando}
            loading={gerarParcelas.isPending}
            onSubmit={(qtd) => gerarParcelas.mutate({ c: gerando, qtd })}
          />
        )}
      </Dialog>
    </AppLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: any = {
    pago: { c: "bg-success/15 text-success border-success/30", l: "Pago" },
    pendente: { c: "bg-warning/15 text-warning-foreground border-warning/30", l: "Pendente" },
    atrasado: { c: "bg-destructive/10 text-destructive border-destructive/30", l: "Atrasado" },
    cancelado: { c: "bg-muted text-muted-foreground", l: "Cancelado" },
  };
  const it = map[status] ?? map.pendente;
  return <Badge variant="outline" className={it.c}>{it.l}</Badge>;
}

function GerarParcelasForm({ cobranca, onSubmit, loading }: { cobranca: Cobranca; onSubmit: (qtd: number) => void; loading: boolean }) {
  const [qtd, setQtd] = useState("3");
  const n = Math.max(1, Math.min(36, parseInt(qtd || "0", 10) || 0));
  const datas = gerarDatas(cobranca.vencimento, cobranca.frequencia ?? "mensal", n, cobranca.recorrencia_fim ?? null);
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Gerar próximas parcelas</DialogTitle></DialogHeader>
      <div className="space-y-3 py-2">
        <p className="text-sm text-muted-foreground">
          {cobranca.descricao} · {FREQ_LABEL[cobranca.frequencia ?? ""] ?? "Recorrente"} · {brl(cobranca.valor)}
        </p>
        <div>
          <Label>Quantas parcelas adiantar? (1 a 36)</Label>
          <Input type="number" min={1} max={36} value={qtd} onChange={(e) => setQtd(e.target.value)} />
        </div>
        <div className="rounded-lg border p-3 text-sm">
          {datas.length === 0 ? (
            <span className="text-muted-foreground">Nenhuma parcela dentro do limite da recorrência.</span>
          ) : (
            <ul className="space-y-1">
              {datas.map((d) => <li key={d} className="flex justify-between"><span>{fmtDate(d)}</span><span className="font-medium">{brl(cobranca.valor)}</span></li>)}
            </ul>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button disabled={loading || datas.length === 0} onClick={() => onSubmit(n)}>
          {loading ? "Gerando..." : `Gerar ${datas.length} parcela(s)`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function CobrancaForm({ clientes, categorias, onSubmit, loading, initial }: { clientes: any[]; categorias: any[]; onSubmit: (p: any) => void; loading: boolean; initial?: Cobranca }) {
  const [form, setForm] = useState({
    cliente_id: initial?.cliente_id ?? "",
    descricao: initial?.descricao ?? "",
    valor: initial ? String(initial.valor) : "",
    vencimento: initial?.vencimento ?? todayISO(),
    observacoes: initial?.observacoes ?? "",
    categoria_id: initial?.categoria_id ?? "",
    recorrente: initial?.recorrente ?? false,
    frequencia: initial?.frequencia ?? "mensal",
    recorrencia_fim: initial?.recorrencia_fim ?? "",
    recorrencia_qtd: initial?.recorrencia_fim
      ? String(fimParaQuantidade(initial.vencimento, initial.frequencia ?? "mensal", initial.recorrencia_fim))
      : "",
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Editar cobrança" : "Nova Cobrança"}</DialogTitle></DialogHeader>
      <div className="grid gap-4 py-2">
        <div>
          <Label>Cliente *</Label>
          <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
            <SelectContent>
              {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Descrição *</Label><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
        <div>
          <Label>Categoria de faturamento</Label>
          <Select value={form.categoria_id} onValueChange={(v) => setForm({ ...form, categoria_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione a fonte de renda" /></SelectTrigger>
            <SelectContent>
              {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          {categorias.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">Crie categorias de entrada na página Categorias.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} /></div>
          <div><Label>Vencimento *</Label><Input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} /></div>
        </div>

        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="flex items-center gap-2"><Repeat className="h-4 w-4 text-primary" /> Mensalidade / recorrência</Label>
              <p className="text-xs text-muted-foreground mt-1">Ao marcar como paga, a próxima cobrança é criada automaticamente.</p>
            </div>
            <Switch checked={form.recorrente} onCheckedChange={(v) => setForm({ ...form, recorrente: v })} />
          </div>
          {form.recorrente && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequência</Label>
                <Select value={form.frequencia} onValueChange={(v) => setForm({ ...form, frequencia: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQ_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantidade de cobranças</Label>
                <Input type="number" min={1} max={120}
                  placeholder="Ex.: 12 (vazia = sem limite)"
                  value={form.recorrencia_qtd}
                  onChange={(e) => setForm({ ...form, recorrencia_qtd: e.target.value })} />
              </div>
            </div>
          )}
        </div>

        <div><Label>Observações</Label><Textarea value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} /></div>
      </div>
      <DialogFooter>
        <Button disabled={loading || !form.cliente_id || !form.descricao || !form.valor}
          onClick={() => {
            const qtd = parseInt(form.recorrencia_qtd, 10);
            const fim = form.recorrente && qtd > 0
              ? quantidadeParaFim(form.vencimento, form.frequencia, qtd)
              : form.recorrencia_fim || null;
            onSubmit({
              cliente_id: form.cliente_id,
              descricao: form.descricao,
              observacoes: form.observacoes,
              vencimento: form.vencimento,
              valor: parseFloat(form.valor),
              categoria_id: form.categoria_id || null,
              recorrente: form.recorrente,
              frequencia: form.recorrente ? form.frequencia : null,
              recorrencia_fim: fim,
            });
          }}>
          {loading ? "Salvando..." : initial ? "Salvar alterações" : "Criar cobrança"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
