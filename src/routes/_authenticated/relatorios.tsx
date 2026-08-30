import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download, TrendingUp, TrendingDown, Users, AlertCircle, BarChart3, FileText, Minus,
  UserCheck, Search, ChevronDown, ChevronRight, CheckCircle2, Clock, Phone, ArrowUpDown, MessageSquare
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, fmtDate, effectiveStatus, todayISO, daysBetween } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart,
} from "recharts";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [
    { title: "Relatórios — CobraZap" },
    { name: "description", content: "DRE, faturamento, movimentações financeiras, cadastros, clientes com cobranças ativas e inadimplência." },
  ] }),
  component: RelatoriosPage,
});

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

function RelatoriosPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
        <PageHeader title="Relatórios" subtitle="Análise financeira e demonstrativo de resultado do seu negócio" />

        <Card className="mb-6">
          <CardContent className="pt-6 flex flex-wrap gap-4 items-end">
            <div><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setFrom(firstOfMonth()); setTo(todayISO()); }}>Este mês</Button>
              <Button variant="outline" size="sm" onClick={() => {
                const d = new Date(); d.setMonth(d.getMonth() - 1); d.setDate(1);
                setFrom(d.toISOString().slice(0, 10));
                const end = new Date(); end.setDate(0);
                setTo(end.toISOString().slice(0, 10));
              }}>Mês passado</Button>
              <Button variant="outline" size="sm" onClick={() => {
                const d = new Date(); d.setFullYear(d.getFullYear(), 0, 1);
                setFrom(d.toISOString().slice(0, 10)); setTo(todayISO());
              }}>Este ano</Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="dre">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="dre" className="gap-1.5"><FileText className="h-3.5 w-3.5" />DRE</TabsTrigger>
            <TabsTrigger value="faturamento" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" />Faturamento</TabsTrigger>
            <TabsTrigger value="movimentacoes" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Movimentações</TabsTrigger>
            <TabsTrigger value="cobrancas-ativas" className="gap-1.5"><UserCheck className="h-3.5 w-3.5" />Cobranças Ativas por Cliente</TabsTrigger>
            <TabsTrigger value="cadastros" className="gap-1.5"><Users className="h-3.5 w-3.5" />Cadastros</TabsTrigger>
            <TabsTrigger value="inadimplencia" className="gap-1.5"><AlertCircle className="h-3.5 w-3.5" />Inadimplência</TabsTrigger>
          </TabsList>

          <TabsContent value="dre"><DRE from={from} to={to} /></TabsContent>
          <TabsContent value="faturamento"><Faturamento from={from} to={to} /></TabsContent>
          <TabsContent value="movimentacoes"><Movimentacoes from={from} to={to} /></TabsContent>
          <TabsContent value="cobrancas-ativas"><ClientesCobrancasAtivas /></TabsContent>
          <TabsContent value="cadastros"><Cadastros from={from} to={to} /></TabsContent>
          <TabsContent value="inadimplencia"><Inadimplencia /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function exportCSV(filename: string, rows: any[], headers: { key: string; label: string }[]) {
  const head = headers.map((h) => h.label).join(";");
  const body = rows.map((r) => headers.map((h) => `"${String(r[h.key] ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + head + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = filename; link.click();
}

// ─── DRE ─────────────────────────────────────────────────────────────────────
function DRE({ from, to }: { from: string; to: string }) {
  const { data: cobrancasPagas = [] } = useQuery({
    queryKey: ["dre-cob", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cobrancas")
        .select("*, categorias(nome)")
        .eq("status", "pago");
      if (error) throw error;
      return ((data ?? []) as any[]).filter((c) => {
        const d = c.data_pagamento || c.vencimento || "";
        return d >= from && d <= to;
      });
    },
  });

  const { data: contasPagas = [] } = useQuery({
    queryKey: ["dre-cp", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar")
        .select("*")
        .eq("status", "pago");
      if (error) throw error;
      return ((data ?? []) as any[]).filter((cp) => {
        const d = cp.pago_em || cp.vencimento || "";
        return d >= from && d <= to;
      });
    },
  });

  const { data: movimentacoes = [] } = useQuery({
    queryKey: ["dre-mov", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes")
        .select("*")
        .gte("data", from)
        .lte("data", to);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Receitas
  const receitaMensalidades = useMemo(() =>
    cobrancasPagas.reduce((s, c) => s + Number(c.valor), 0), [cobrancasPagas]);

  const entradasManuais = useMemo(() =>
    movimentacoes
      .filter((m: any) => m.tipo === "entrada" && !m.cobranca_id && (!m.status || m.status === "pago" || m.status === "recebido"))
      .reduce((s, m: any) => s + Number(m.valor), 0), [movimentacoes]);

  const totalReceitas = receitaMensalidades + entradasManuais;

  // Despesas
  const despesasContas = useMemo(() =>
    contasPagas.reduce((s, c) => s + Number(c.valor), 0), [contasPagas]);

  const saidasManuais = useMemo(() =>
    movimentacoes
      .filter((m: any) => m.tipo === "saida" && !m.conta_pagar_id && (!m.status || m.status === "pago"))
      .reduce((s, m: any) => s + Number(m.valor), 0), [movimentacoes]);

  const totalDespesas = despesasContas + saidasManuais;

  const resultadoOperacional = totalReceitas - totalDespesas;
  const margemLiquida = totalReceitas > 0 ? (resultadoOperacional / totalReceitas) * 100 : 0;

  // Receita por categoria (Cobranças Pagas + Entradas Avulsas)
  const receitaCategoria = useMemo(() => {
    const map: Record<string, number> = {};
    cobrancasPagas.forEach((c: any) => {
      const nome = c.categorias?.nome ?? "Cobranças / Mensalidades";
      map[nome] = (map[nome] ?? 0) + Number(c.valor);
    });
    movimentacoes
      .filter((m: any) => m.tipo === "entrada" && !m.cobranca_id && (!m.status || m.status === "pago" || m.status === "recebido"))
      .forEach((m: any) => {
        const cat = m.categoria || "Entradas Avulsas";
        map[cat] = (map[cat] ?? 0) + Number(m.valor);
      });
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [cobrancasPagas, movimentacoes]);

  // Despesa por categoria (Contas a Pagar + Saídas Avulsas)
  const despesaCategoria = useMemo(() => {
    const map: Record<string, number> = {};
    contasPagas.forEach((c: any) => {
      const cat = c.categoria ?? "Contas Fixas / Fornecedores";
      map[cat] = (map[cat] ?? 0) + Number(c.valor);
    });
    movimentacoes
      .filter((m: any) => m.tipo === "saida" && !m.conta_pagar_id && (!m.status || m.status === "pago"))
      .forEach((m: any) => {
        const cat = m.categoria || "Saídas Avulsas";
        map[cat] = (map[cat] ?? 0) + Number(m.valor);
      });
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [contasPagas, movimentacoes]);

  // Gráfico mensal da DRE
  const graficoMensal = useMemo(() => {
    const fromDate = new Date(from + "T00:00:00");
    const toDate = new Date(to + "T00:00:00");
    const meses: { key: string; label: string; receitas: number; despesas: number; resultado: number }[] = [];

    let cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
    while (cur <= toDate) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      const label = cur.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

      const receitas =
        cobrancasPagas.filter((c: any) => (c.data_pagamento ?? c.vencimento ?? "").startsWith(key)).reduce((s, c: any) => s + Number(c.valor), 0) +
        movimentacoes.filter((m: any) => m.tipo === "entrada" && !m.cobranca_id && (!m.status || m.status === "pago" || m.status === "recebido") && (m.data ?? "").startsWith(key)).reduce((s, m: any) => s + Number(m.valor), 0);

      const despesas =
        contasPagas.filter((c: any) => (c.pago_em ?? c.vencimento ?? "").startsWith(key)).reduce((s, c: any) => s + Number(c.valor), 0) +
        movimentacoes.filter((m: any) => m.tipo === "saida" && !m.conta_pagar_id && (!m.status || m.status === "pago") && (m.data ?? "").startsWith(key)).reduce((s, m: any) => s + Number(m.valor), 0);

      meses.push({ key, label, receitas, despesas, resultado: receitas - despesas });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return meses;
  }, [cobrancasPagas, contasPagas, movimentacoes, from, to]);

  // Exportar DRE como CSV
  const exportDRE = () => {
    const rows = [
      { item: "RECEITAS", valor: "" },
      { item: "  Mensalidades / Cobranças Recebidas", valor: brl(receitaMensalidades) },
      { item: "  Entradas Manuais", valor: brl(entradasManuais) },
      { item: "TOTAL DE RECEITAS", valor: brl(totalReceitas) },
      { item: "", valor: "" },
      { item: "DESPESAS", valor: "" },
      { item: "  Contas a Pagar (quitadas)", valor: brl(despesasContas) },
      { item: "  Saídas Manuais", valor: brl(saidasManuais) },
      { item: "TOTAL DE DESPESAS", valor: brl(totalDespesas) },
      { item: "", valor: "" },
      { item: "RESULTADO OPERACIONAL", valor: brl(resultadoOperacional) },
      { item: "MARGEM LÍQUIDA", valor: `${margemLiquida.toFixed(1)}%` },
    ];
    exportCSV(`dre-${from}-a-${to}.csv`, rows, [{ key: "item", label: "Item" }, { key: "valor", label: "Valor" }]);
  };

  return (
    <div className="mt-4 space-y-6">
      {/* Cabeçalho DRE */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Demonstrativo de Resultado do Exercício (DRE)</h2>
          <p className="text-sm text-muted-foreground">Período: {fmtDate(from)} a {fmtDate(to)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportDRE}>
          <Download className="h-4 w-4 mr-2" /> Exportar DRE
        </Button>
      </div>

      {/* Resultado Resumido */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatBox label="Total de Receitas" value={brl(totalReceitas)} tone="success" icon={TrendingUp} />
        <StatBox label="Total de Despesas" value={brl(totalDespesas)} tone="destructive" icon={TrendingDown} />
        <StatBox
          label="Resultado Operacional"
          value={brl(resultadoOperacional)}
          tone={resultadoOperacional >= 0 ? "success" : "destructive"}
          icon={resultadoOperacional >= 0 ? TrendingUp : TrendingDown}
          subtext={`Margem: ${margemLiquida.toFixed(1)}%`}
        />
      </div>

      {/* Tabela DRE detalhada */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Estrutura da DRE</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <tbody>
              {/* Receitas */}
              <tr className="bg-success/5 border-t">
                <td className="px-4 py-3 font-bold text-success uppercase tracking-wide text-sm" colSpan={2}>Receitas</td>
              </tr>
              <DRERow label="Mensalidades / Cobranças Recebidas" valor={receitaMensalidades} indent />
              <DRERow label="Entradas Manuais" valor={entradasManuais} indent />
              <DRERow label="Total de Receitas" valor={totalReceitas} bold highlight="success" />

              {/* Despesas */}
              <tr className="bg-destructive/5 border-t">
                <td className="px-4 py-3 font-bold text-destructive uppercase tracking-wide text-sm" colSpan={2}>Despesas</td>
              </tr>
              <DRERow label="Contas a Pagar (quitadas)" valor={despesasContas} indent negative />
              <DRERow label="Saídas Manuais" valor={saidasManuais} indent negative />
              <DRERow label="Total de Despesas" valor={totalDespesas} bold negative highlight="destructive" />

              {/* Resultado */}
              <tr className="border-t-2 bg-muted/30">
                <td className="px-4 py-4 font-bold text-base">Resultado Operacional</td>
                <td className={`px-4 py-4 text-right font-bold text-xl ${resultadoOperacional >= 0 ? "text-success" : "text-destructive"}`}>
                  {resultadoOperacional >= 0 ? "+" : ""}{brl(resultadoOperacional)}
                </td>
              </tr>
              <tr className="border-t bg-muted/10">
                <td className="px-4 py-3 text-muted-foreground text-sm">Margem Líquida</td>
                <td className={`px-4 py-3 text-right font-semibold ${margemLiquida >= 0 ? "text-success" : "text-destructive"}`}>
                  {margemLiquida.toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Gráfico Mensal */}
      {graficoMensal.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Receitas vs Despesas por Mês</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={graficoMensal} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any, name: string) => [brl(v), name === "receitas" ? "Receitas" : name === "despesas" ? "Despesas" : "Resultado"]} />
                <Legend formatter={(v) => v === "receitas" ? "Receitas" : v === "despesas" ? "Despesas" : "Resultado"} />
                <Bar dataKey="receitas" fill="hsl(142, 76%, 36%)" name="receitas" radius={[3, 3, 0, 0]} />
                <Bar dataKey="despesas" fill="hsl(0, 84%, 60%)" name="despesas" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Detalhamento por Categoria */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base text-success">Receitas por Categoria</CardTitle></CardHeader>
          <CardContent>
            {receitaCategoria.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma receita no período</p>
            ) : (
              <div className="space-y-3">
                {receitaCategoria.map(([cat, valor]) => {
                  const pct = totalReceitas > 0 ? Math.round((valor / totalReceitas) * 100) : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{cat}</span>
                        <span>{brl(valor)} <span className="text-muted-foreground text-xs">({pct}%)</span></span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className="bg-success rounded-full h-1.5" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base text-destructive">Despesas por Categoria</CardTitle></CardHeader>
          <CardContent>
            {despesaCategoria.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma despesa no período</p>
            ) : (
              <div className="space-y-3">
                {despesaCategoria.map(([cat, valor]) => {
                  const pct = totalDespesas > 0 ? Math.round((valor / totalDespesas) * 100) : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{cat}</span>
                        <span>{brl(valor)} <span className="text-muted-foreground text-xs">({pct}%)</span></span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className="bg-destructive/60 rounded-full h-1.5" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DRERow({ label, valor, indent, negative, bold, highlight }: {
  label: string; valor: number; indent?: boolean; negative?: boolean; bold?: boolean; highlight?: "success" | "destructive";
}) {
  const bgClass = highlight === "success" ? "bg-success/5" : highlight === "destructive" ? "bg-destructive/5" : "";
  const textClass = highlight === "success" ? "text-success" : highlight === "destructive" ? "text-destructive" : "";
  return (
    <tr className={`border-t ${bgClass} hover:bg-muted/20`}>
      <td className={`px-4 py-2.5 text-sm ${indent ? "pl-8 text-muted-foreground" : ""} ${bold ? "font-semibold" : ""}`}>
        {label}
      </td>
      <td className={`px-4 py-2.5 text-right text-sm ${bold ? "font-semibold" : ""} ${textClass || (negative ? "text-destructive" : "")}`}>
        {negative && valor > 0 ? "-" : ""}{brl(valor)}
      </td>
    </tr>
  );
}

// ─── FATURAMENTO ─────────────────────────────────────────────────────────────
function Faturamento({ from, to }: { from: string; to: string }) {
  const { data = [] } = useQuery({
    queryKey: ["rel-fat", from, to],
    queryFn: async () => ((await supabase.from("cobrancas").select("*, clientes(nome), categorias(nome)")
      .gte("vencimento", from).lte("vencimento", to)).data ?? []) as any[],
  });

  const stats = useMemo(() => {
    const pago = data.filter((c) => c.status === "pago");
    const pendente = data.filter((c) => c.status === "pendente");
    const atrasado = data.filter((c) => effectiveStatus(c.vencimento, c.status) === "atrasado");
    const sum = (arr: any[]) => arr.reduce((s, c) => s + Number(c.valor), 0);
    const total = sum(data);
    const recebido = sum(pago);
    const taxa = total > 0 ? Math.round((recebido / total) * 100) : 0;
    return { total, pago: recebido, pendente: sum(pendente), atrasado: sum(atrasado), qtd: data.length, taxa };
  }, [data]);

  const byMonth = useMemo(() => {
    const map: Record<string, { mes: string; pago: number; pendente: number }> = {};
    data.forEach((c) => {
      const m = (c.data_pagamento ?? c.vencimento).slice(0, 7);
      map[m] = map[m] ?? { mes: m, pago: 0, pendente: 0 };
      if (c.status === "pago") map[m].pago += Number(c.valor);
      else map[m].pendente += Number(c.valor);
    });
    return Object.values(map).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [data]);

  const byCategoria = useMemo(() => {
    const map: Record<string, { categoria: string; total: number; recebido: number; qtd: number }> = {};
    data.forEach((c) => {
      const nome = c.categorias?.nome ?? "Sem categoria";
      map[nome] = map[nome] ?? { categoria: nome, total: 0, recebido: 0, qtd: 0 };
      map[nome].total += Number(c.valor);
      map[nome].qtd += 1;
      if (c.status === "pago") map[nome].recebido += Number(c.valor);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [data]);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Total do período" value={brl(stats.total)} icon={TrendingUp} />
        <StatBox label="Recebido" value={brl(stats.pago)} tone="success" icon={TrendingUp} subtext={`Taxa: ${stats.taxa}%`} />
        <StatBox label="A receber" value={brl(stats.pendente)} tone="warning" icon={TrendingDown} />
        <StatBox label="Em atraso" value={brl(stats.atrasado)} tone="destructive" icon={AlertCircle} />
      </div>

      {/* Barra de progresso de recebimento */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">Taxa de Recebimento do Período</span>
            <span className="font-bold text-success">{stats.taxa}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-3">
            <div className="bg-success rounded-full h-3 transition-all" style={{ width: `${stats.taxa}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>Recebido: {brl(stats.pago)}</span>
            <span>Total: {brl(stats.total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Faturamento por mês</CardTitle></CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byMonth}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="mes" />
              <YAxis tickFormatter={(v) => `R$${v}`} />
              <Tooltip formatter={(v: any) => brl(v)} />
              <Legend />
              <Bar dataKey="pago" fill="hsl(142, 76%, 36%)" name="Recebido" radius={[3, 3, 0, 0]} />
              <Bar dataKey="pendente" fill="hsl(48, 96%, 53%)" name="Pendente" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Faturamento por fonte de renda</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportCSV("faturamento-categorias.csv", byCategoria, [
            { key: "categoria", label: "Categoria" }, { key: "qtd", label: "Cobranças" },
            { key: "total", label: "Total" }, { key: "recebido", label: "Recebido" },
          ])}><Download className="h-4 w-4 mr-2" /> Exportar CSV</Button>
        </CardHeader>
        <CardContent className="p-0">
          {byCategoria.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Nenhuma cobrança no período</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Categoria</th>
                  <th className="text-right px-4 py-3">Cobranças</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-right px-4 py-3">Recebido</th>
                  <th className="text-right px-4 py-3">Taxa</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byCategoria.map((c) => {
                  const taxa = c.total > 0 ? Math.round((c.recebido / c.total) * 100) : 0;
                  return (
                    <tr key={c.categoria} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{c.categoria}</td>
                      <td className="px-4 py-3 text-right">{c.qtd}</td>
                      <td className="px-4 py-3 text-right font-semibold">{brl(c.total)}</td>
                      <td className="px-4 py-3 text-right text-success">{brl(c.recebido)}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant="outline" className={taxa >= 80 ? "bg-success/15 text-success border-success/30" : taxa >= 50 ? "bg-warning/15 text-warning-foreground" : "bg-destructive/10 text-destructive"}>
                          {taxa}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Detalhamento ({stats.qtd})</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportCSV("faturamento.csv", data.map((c: any) => ({
            cliente: c.clientes?.nome, descricao: c.descricao, valor: c.valor,
            vencimento: c.vencimento, status: effectiveStatus(c.vencimento, c.status),
            pagamento: c.data_pagamento ?? "",
          })), [
            { key: "cliente", label: "Cliente" }, { key: "descricao", label: "Descrição" },
            { key: "valor", label: "Valor" }, { key: "vencimento", label: "Vencimento" },
            { key: "status", label: "Status" }, { key: "pagamento", label: "Pagamento" },
          ])}><Download className="h-4 w-4 mr-2" /> Exportar CSV</Button>
        </CardHeader>
        <CardContent className="p-0">
          <TabelaCobrancas items={data} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── MOVIMENTAÇÕES ────────────────────────────────────────────────────────────
function Movimentacoes({ from, to }: { from: string; to: string }) {
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "mensalidades" | "entradas" | "saidas">("todos");

  const { data: movData = [] } = useQuery({
    queryKey: ["rel-mov", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes")
        .select("*, clientes(nome)")
        .gte("data", from)
        .lte("data", to)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: cobData = [] } = useQuery({
    queryKey: ["rel-cob-pagas", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cobrancas")
        .select("*, clientes(nome)")
        .eq("status", "pago");
      if (error) throw error;
      return ((data ?? []) as any[]).filter((c) => {
        const d = c.data_pagamento || c.vencimento || "";
        return d >= from && d <= to;
      });
    },
  });

  const { data: contasPagasData = [] } = useQuery({
    queryKey: ["rel-contas-pagas", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar")
        .select("*")
        .eq("status", "pago");
      if (error) throw error;
      return ((data ?? []) as any[]).filter((cp) => {
        const d = cp.pago_em || cp.vencimento || "";
        return d >= from && d <= to;
      });
    },
  });

  const allItems = useMemo(() => {
    const list: {
      id: string; data: string; tipo: "entrada" | "saida";
      origem: "mensalidade" | "entrada" | "saida";
      origemRotulo: string; descricao: string; cliente: string; valor: number;
    }[] = [];

    // Inclui apenas movimentações manuais avulsas (evita duplicar com cobranças/contas a pagar)
    movData
      .filter((m: any) => !m.cobranca_id && !m.conta_pagar_id && (!m.status || m.status === "pago" || m.status === "recebido"))
      .forEach((m: any) => {
        list.push({
          id: `mov-${m.id}`, data: m.data, tipo: m.tipo,
          origem: m.tipo === "entrada" ? "entrada" : "saida",
          origemRotulo: m.tipo === "entrada" ? "Entrada Manual" : "Saída Manual",
          descricao: m.descricao, cliente: m.clientes?.nome ?? "—", valor: Number(m.valor),
        });
      });

    cobData.forEach((c: any) => {
      list.push({
        id: `cob-${c.id}`, data: c.data_pagamento ?? c.vencimento, tipo: "entrada",
        origem: "mensalidade", origemRotulo: "Mensalidade Recebida",
        descricao: c.descricao, cliente: c.clientes?.nome ?? "—", valor: Number(c.valor),
      });
    });

    contasPagasData.forEach((cp: any) => {
      list.push({
        id: `cp-${cp.id}`, data: cp.pago_em ?? cp.vencimento, tipo: "saida",
        origem: "saida", origemRotulo: "Conta Paga",
        descricao: cp.descricao, cliente: cp.fornecedor ? `Fornecedor: ${cp.fornecedor}` : "—",
        valor: Number(cp.valor),
      });
    });

    return list.sort((a, b) => b.data.localeCompare(a.data));
  }, [movData, cobData, contasPagasData]);

  const filteredItems = useMemo(() => {
    if (tipoFiltro === "todos") return allItems;
    if (tipoFiltro === "mensalidades") return allItems.filter((i) => i.origem === "mensalidade");
    if (tipoFiltro === "entradas") return allItems.filter((i) => i.tipo === "entrada");
    if (tipoFiltro === "saidas") return allItems.filter((i) => i.tipo === "saida");
    return allItems;
  }, [allItems, tipoFiltro]);

  const totalMensalidades = useMemo(() => allItems.filter((i) => i.origem === "mensalidade").reduce((s, i) => s + i.valor, 0), [allItems]);
  const totalEntradas = useMemo(() => allItems.filter((i) => i.tipo === "entrada").reduce((s, i) => s + i.valor, 0), [allItems]);
  const totalSaidas = useMemo(() => allItems.filter((i) => i.tipo === "saida").reduce((s, i) => s + i.valor, 0), [allItems]);
  const saldo = totalEntradas - totalSaidas;

  // Gráfico acumulado diário
  const graficoAcumulado = useMemo(() => {
    const dias: Record<string, { data: string; entradas: number; saidas: number }> = {};
    [...allItems].sort((a, b) => a.data.localeCompare(b.data)).forEach((i) => {
      dias[i.data] = dias[i.data] ?? { data: i.data, entradas: 0, saidas: 0 };
      if (i.tipo === "entrada") dias[i.data].entradas += i.valor;
      else dias[i.data].saidas += i.valor;
    });
    return Object.values(dias).map((d) => ({ ...d, label: fmtDate(d.data) }));
  }, [allItems]);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Mensalidades Recebidas" value={brl(totalMensalidades)} tone="success" icon={TrendingUp} />
        <StatBox label="Total Entradas" value={brl(totalEntradas)} tone="success" icon={TrendingUp} />
        <StatBox label="Total Saídas" value={brl(totalSaidas)} tone="destructive" icon={TrendingDown} />
        <StatBox label="Saldo no Período" value={brl(saldo)} tone={saldo >= 0 ? "success" : "destructive"} icon={saldo >= 0 ? TrendingUp : TrendingDown} />
      </div>

      {graficoAcumulado.length > 1 && (
        <Card>
          <CardHeader><CardTitle>Entradas vs Saídas por Dia</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={graficoAcumulado}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `R$${v}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => brl(v)} />
                <Legend />
                <Area type="monotone" dataKey="entradas" stroke="hsl(142, 76%, 36%)" fill="hsl(142, 76%, 36%, 0.1)" name="Entradas" />
                <Area type="monotone" dataKey="saidas" stroke="hsl(0, 84%, 60%)" fill="hsl(0, 84%, 60%, 0.1)" name="Saídas" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant={tipoFiltro === "todos" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("todos")}>
          Todos ({allItems.length})
        </Button>
        <Button variant={tipoFiltro === "mensalidades" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("mensalidades")}>
          Mensalidades ({allItems.filter((i) => i.origem === "mensalidade").length})
        </Button>
        <Button variant={tipoFiltro === "entradas" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("entradas")}>
          Entradas ({allItems.filter((i) => i.tipo === "entrada").length})
        </Button>
        <Button variant={tipoFiltro === "saidas" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("saidas")}>
          Saídas ({allItems.filter((i) => i.tipo === "saida").length})
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Extrato de Lançamentos ({filteredItems.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportCSV("movimentacoes-e-recebimentos.csv", filteredItems.map((m) => ({
            data: m.data, origem: m.origemRotulo, tipo: m.tipo, descricao: m.descricao,
            cliente: m.cliente, valor: m.valor,
          })), [
            { key: "data", label: "Data" }, { key: "origem", label: "Tipo de Lançamento" },
            { key: "tipo", label: "Natureza" }, { key: "descricao", label: "Descrição" },
            { key: "cliente", label: "Cliente/Fornecedor" }, { key: "valor", label: "Valor" },
          ])}><Download className="h-4 w-4 mr-2" /> Exportar CSV</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-left px-4 py-3">Tipo / Origem</th>
                <th className="text-left px-4 py-3">Descrição</th>
                <th className="text-left px-4 py-3">Cliente / Fornecedor</th>
                <th className="text-right px-4 py-3">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredItems.map((m) => (
                <tr key={m.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm">{fmtDate(m.data)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={m.tipo === "entrada" ? "bg-success/15 text-success border-success/30" : "bg-destructive/10 text-destructive border-destructive/30"}>
                      {m.origemRotulo}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm">{m.descricao}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{m.cliente}</td>
                  <td className={"px-4 py-3 text-right font-semibold text-sm " + (m.tipo === "entrada" ? "text-success" : "text-destructive")}>
                    {m.tipo === "entrada" ? "+" : "-"} {brl(m.valor)}
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum lançamento encontrado no período</td></tr>}
            </tbody>
          </table>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── COBRANÇAS ATIVAS POR CLIENTE ───────────────────────────────────────────
function ClientesCobrancasAtivas() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "com_ativas" | "em_dia" | "com_atraso" | "sem_ativas">("com_ativas");
  const [clienteAtivoFilter, setClienteAtivoFilter] = useState<"todos" | "ativos" | "inativos">("todos");
  const [sortOrder, setSortOrder] = useState<"maior_valor" | "menor_valor" | "mais_cobrancas" | "nome_asc" | "proximo_vencimento">("maior_valor");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: ["rel-clientes-cobrancas-ativas-clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, telefone, email, documento, ativo, created_at")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: cobrancas = [], isLoading: loadingCobrancas } = useQuery({
    queryKey: ["rel-clientes-cobrancas-ativas-cobrancas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cobrancas")
        .select("id, cliente_id, descricao, valor, vencimento, status, data_pagamento, recorrente, frequencia, categorias(nome)")
        .order("vencimento");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const today = todayISO();

  // Consolidação dos dados por cliente
  const clientesConsolidados = useMemo(() => {
    // Agrupa cobranças por cliente_id
    const cobPorCliente: Record<string, any[]> = {};
    cobrancas.forEach((c) => {
      if (!c.cliente_id) return;
      if (!cobPorCliente[c.cliente_id]) cobPorCliente[c.cliente_id] = [];
      cobPorCliente[c.cliente_id].push(c);
    });

    return clientes.map((cli) => {
      const cList = cobPorCliente[cli.id] ?? [];
      const ativas = cList.filter((c) => c.status === "pendente");
      const emDia = ativas.filter((c) => effectiveStatus(c.vencimento, c.status) !== "atrasado");
      const atrasadas = ativas.filter((c) => effectiveStatus(c.vencimento, c.status) === "atrasado");
      const pagas = cList.filter((c) => c.status === "pago");
      const recorrentes = cList.filter((c) => c.recorrente);

      const valorAtivo = ativas.reduce((s, c) => s + Number(c.valor), 0);
      const valorEmDia = emDia.reduce((s, c) => s + Number(c.valor), 0);
      const valorAtrasado = atrasadas.reduce((s, c) => s + Number(c.valor), 0);
      const valorPago = pagas.reduce((s, c) => s + Number(c.valor), 0);

      // Próximo vencimento (ou vencimento pendente mais urgente)
      let proximoVencimento: string | null = null;
      if (ativas.length > 0) {
        const sortedAtivas = [...ativas].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
        const futuro = sortedAtivas.find((c) => c.vencimento >= today);
        proximoVencimento = futuro ? futuro.vencimento : sortedAtivas[0].vencimento;
      }

      // Maior atraso em dias
      let maiorAtrasoDias = 0;
      if (atrasadas.length > 0) {
        maiorAtrasoDias = Math.max(...atrasadas.map((c) => daysBetween(c.vencimento, today)));
      }

      let situacao: "em_dia" | "atrasado" | "sem_cobrancas" = "sem_cobrancas";
      if (ativas.length > 0) {
        situacao = atrasadas.length > 0 ? "atrasado" : "em_dia";
      }

      return {
        ...cli,
        cobrancasTotal: cList.length,
        cobrancasAtivas: ativas,
        totalAtivas: ativas.length,
        totalEmDia: emDia.length,
        totalAtrasadas: atrasadas.length,
        totalPagas: pagas.length,
        totalRecorrentes: recorrentes.length,
        valorAtivo,
        valorEmDia,
        valorAtrasado,
        valorPago,
        proximoVencimento,
        maiorAtrasoDias,
        situacao,
      };
    });
  }, [clientes, cobrancas, today]);

  // Estatísticas Gerais (KPIs)
  const stats = useMemo(() => {
    const totalClientes = clientesConsolidados.length;
    const comAtivas = clientesConsolidados.filter((c) => c.totalAtivas > 0);
    const semAtivas = clientesConsolidados.filter((c) => c.totalAtivas === 0);
    const emDia = clientesConsolidados.filter((c) => c.situacao === "em_dia");
    const comAtraso = clientesConsolidados.filter((c) => c.situacao === "atrasado");

    const totalValorAtivo = comAtivas.reduce((s, c) => s + c.valorAtivo, 0);
    const totalValorEmDia = comAtivas.reduce((s, c) => s + c.valorEmDia, 0);
    const totalValorAtrasado = comAtivas.reduce((s, c) => s + c.valorAtrasado, 0);
    const totalQtdAtivas = comAtivas.reduce((s, c) => s + c.totalAtivas, 0);
    const totalQtdAtrasadas = comAtivas.reduce((s, c) => s + c.totalAtrasadas, 0);
    const totalQtdEmDia = comAtivas.reduce((s, c) => s + c.totalEmDia, 0);

    const pctComAtivas = totalClientes > 0 ? Math.round((comAtivas.length / totalClientes) * 100) : 0;
    const pctSemAtivas = totalClientes > 0 ? Math.round((semAtivas.length / totalClientes) * 100) : 0;
    const ticketMedio = comAtivas.length > 0 ? totalValorAtivo / comAtivas.length : 0;

    return {
      totalClientes,
      totalComAtivas: comAtivas.length,
      pctComAtivas,
      totalSemAtivas: semAtivas.length,
      pctSemAtivas,
      totalEmDia: emDia.length,
      totalComAtraso: comAtraso.length,
      totalValorAtivo,
      totalValorEmDia,
      totalValorAtrasado,
      totalQtdAtivas,
      totalQtdEmDia,
      totalQtdAtrasadas,
      ticketMedio,
    };
  }, [clientesConsolidados]);

  // Gráficos
  const pieData = useMemo(() => [
    { name: "Cobranças em Dia", value: stats.totalEmDia, color: "hsl(142, 76%, 36%)" },
    { name: "Com Cobranças em Atraso", value: stats.totalComAtraso, color: "hsl(0, 84%, 60%)" },
    { name: "Sem Cobranças Ativas", value: stats.totalSemAtivas, color: "hsl(215, 14%, 65%)" },
  ], [stats]);

  const topClientesAtivos = useMemo(() => {
    return [...clientesConsolidados]
      .filter((c) => c.valorAtivo > 0)
      .sort((a, b) => b.valorAtivo - a.valorAtivo)
      .slice(0, 8)
      .map((c) => ({
        nome: c.nome.length > 18 ? c.nome.slice(0, 16) + "…" : c.nome,
        valorAtivo: c.valorAtivo,
        qtd: c.totalAtivas,
      }));
  }, [clientesConsolidados]);

  // Filtragem e Ordenação da Tabela
  const clientesFiltrados = useMemo(() => {
    return clientesConsolidados
      .filter((c) => {
        // Filtro por texto
        if (search.trim()) {
          const s = search.toLowerCase();
          const match =
            c.nome.toLowerCase().includes(s) ||
            (c.telefone || "").includes(s) ||
            (c.documento || "").toLowerCase().includes(s) ||
            (c.email || "").toLowerCase().includes(s);
          if (!match) return false;
        }

        // Filtro por status de cobrança
        if (statusFilter === "com_ativas" && c.totalAtivas === 0) return false;
        if (statusFilter === "em_dia" && c.situacao !== "em_dia") return false;
        if (statusFilter === "com_atraso" && c.situacao !== "atrasado") return false;
        if (statusFilter === "sem_ativas" && c.totalAtivas > 0) return false;

        // Filtro por status do cadastro do cliente
        if (clienteAtivoFilter === "ativos" && !c.ativo) return false;
        if (clienteAtivoFilter === "inativos" && c.ativo) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortOrder === "maior_valor") return b.valorAtivo - a.valorAtivo;
        if (sortOrder === "menor_valor") return a.valorAtivo - b.valorAtivo;
        if (sortOrder === "mais_cobrancas") return b.totalAtivas - a.totalAtivas;
        if (sortOrder === "nome_asc") return a.nome.localeCompare(b.nome);
        if (sortOrder === "proximo_vencimento") {
          if (!a.proximoVencimento) return 1;
          if (!b.proximoVencimento) return -1;
          return a.proximoVencimento.localeCompare(b.proximoVencimento);
        }
        return 0;
      });
  }, [clientesConsolidados, search, statusFilter, clienteAtivoFilter, sortOrder]);

  // Exportação CSV
  const handleExportCSV = () => {
    const rows = clientesConsolidados.map((c) => ({
      nome: c.nome,
      telefone: c.telefone || "",
      email: c.email || "",
      documento: c.documento || "",
      status_cliente: c.ativo ? "Ativo" : "Inativo",
      tem_cobrancas_ativas: c.totalAtivas > 0 ? "Sim" : "Não",
      qtd_cobrancas_ativas: c.totalAtivas,
      valor_total_ativo: brl(c.valorAtivo),
      qtd_em_dia: c.totalEmDia,
      valor_em_dia: brl(c.valorEmDia),
      qtd_em_atraso: c.totalAtrasadas,
      valor_em_atraso: brl(c.valorAtrasado),
      proximo_vencimento: c.proximoVencimento ? fmtDate(c.proximoVencimento) : "—",
      maior_atraso_dias: c.maiorAtrasoDias > 0 ? `${c.maiorAtrasoDias} dias` : "0",
      situacao: c.situacao === "em_dia" ? "Em dia" : c.situacao === "atrasado" ? "Em atraso" : "Sem cobranças ativas",
      total_cobrancas_pagas: c.totalPagas,
      valor_total_pago: brl(c.valorPago),
    }));

    exportCSV("relatorio-clientes-cobrancas-ativas.csv", rows, [
      { key: "nome", label: "Cliente" },
      { key: "telefone", label: "Telefone" },
      { key: "email", label: "Email" },
      { key: "documento", label: "Documento" },
      { key: "status_cliente", label: "Status Cadastro" },
      { key: "tem_cobrancas_ativas", label: "Tem Cobrança Ativa?" },
      { key: "qtd_cobrancas_ativas", label: "Qtd Cobranças Ativas" },
      { key: "valor_total_ativo", label: "Total em Aberto" },
      { key: "qtd_em_dia", label: "Qtd em Dia" },
      { key: "valor_em_dia", label: "Valor em Dia" },
      { key: "qtd_em_atraso", label: "Qtd em Atraso" },
      { key: "valor_em_atraso", label: "Valor em Atraso" },
      { key: "proximo_vencimento", label: "Próximo Vencimento" },
      { key: "maior_atraso_dias", label: "Maior Atraso" },
      { key: "situacao", label: "Situação" },
      { key: "total_cobrancas_pagas", label: "Cobranças Pagas (Histórico)" },
      { key: "valor_total_pago", label: "Total Pago (Histórico)" },
    ]);
  };

  return (
    <div className="mt-4 space-y-6">
      {/* Cabeçalho do Relatório */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Clientes com Cobranças Ativas
          </h2>
          <p className="text-sm text-muted-foreground">
            Visão consolidada de quantos e quais clientes cadastrados possuem cobranças e mensalidades em aberto.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} className="self-start sm:self-auto">
          <Download className="h-4 w-4 mr-2" /> Exportar Relatório CSV
        </Button>
      </div>

      {/* Cards de Métricas e KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox
          label="Clientes Cadastrados"
          value={stats.totalClientes.toString()}
          icon={Users}
          subtext="Base total de clientes"
        />
        <StatBox
          label="Clientes c/ Cobranças Ativas"
          value={`${stats.totalComAtivas}`}
          tone="success"
          icon={UserCheck}
          subtext={`${stats.pctComAtivas}% da base (${stats.totalQtdAtivas} cobranças)`}
        />
        <StatBox
          label="Clientes s/ Cobranças Ativas"
          value={`${stats.totalSemAtivas}`}
          icon={Minus}
          subtext={`${stats.pctSemAtivas}% da base sem pendências`}
        />
        <StatBox
          label="Total Ativo a Receber"
          value={brl(stats.totalValorAtivo)}
          tone="info"
          icon={TrendingUp}
          subtext={`Ticket médio: ${brl(stats.ticketMedio)}/cliente`}
        />
      </div>

      {/* Métricas secundárias de pontualidade */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-success">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase">Clientes Em Dia</div>
              <div className="text-xl font-bold text-success mt-1">{stats.totalEmDia} clientes</div>
              <div className="text-xs text-muted-foreground">{brl(stats.totalValorEmDia)} ({stats.totalQtdEmDia} cobranças)</div>
            </div>
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-destructive">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase">Clientes em Atraso</div>
              <div className="text-xl font-bold text-destructive mt-1">{stats.totalComAtraso} clientes</div>
              <div className="text-xs text-muted-foreground">{brl(stats.totalValorAtrasado)} ({stats.totalQtdAtrasadas} cobranças)</div>
            </div>
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-muted-foreground">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase">Taxa de Cobertura Ativa</div>
              <div className="text-xl font-bold mt-1">{stats.pctComAtivas}%</div>
              <div className="text-xs text-muted-foreground">dos clientes possuem cobranças ativas</div>
            </div>
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <BarChart3 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gráfico 1: Proporção de Clientes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Distribuição da Carteira de Clientes
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {stats.totalClientes === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Nenhum cliente cadastrado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any, name: any) => [`${value} clientes (${stats.totalClientes > 0 ? Math.round((Number(value) / stats.totalClientes) * 100) : 0}%)`, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 2: Top Clientes com Maior Volume Ativo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Top Clientes por Volume em Aberto (R$)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {topClientesAtivos.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Nenhum cliente com cobranças em aberto
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topClientesAtivos} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" tickFormatter={(v) => `R$${v}`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [brl(v), "Total Ativo"]} />
                  <Bar dataKey="valorAtivo" fill="hsl(221, 83%, 53%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Painel de Filtros e Busca */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Campo de Busca */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone, documento ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Selects de Filtros */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="w-44">
                <Select value={sortOrder} onValueChange={(v: any) => setSortOrder(v)}>
                  <SelectTrigger className="h-9">
                    <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Ordenar por" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maior_valor">Maior valor ativo</SelectItem>
                    <SelectItem value="menor_valor">Menor valor ativo</SelectItem>
                    <SelectItem value="mais_cobrancas">Mais cobranças</SelectItem>
                    <SelectItem value="nome_asc">Nome (A - Z)</SelectItem>
                    <SelectItem value="proximo_vencimento">Próximo vencimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-36">
                <Select value={clienteAtivoFilter} onValueChange={(v: any) => setClienteAtivoFilter(v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Status cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos cadastros</SelectItem>
                    <SelectItem value="ativos">Apenas ativos</SelectItem>
                    <SelectItem value="inativos">Apenas inativos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Botões de Filtro Rápido de Cobrança */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              variant={statusFilter === "todos" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("todos")}
            >
              Todos ({clientesConsolidados.length})
            </Button>
            <Button
              variant={statusFilter === "com_ativas" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("com_ativas")}
              className={statusFilter === "com_ativas" ? "" : "border-primary/40 text-primary"}
            >
              Com Cobranças Ativas ({stats.totalComAtivas})
            </Button>
            <Button
              variant={statusFilter === "em_dia" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("em_dia")}
              className={statusFilter === "em_dia" ? "" : "text-success border-success/40"}
            >
              Em Dia ({stats.totalEmDia})
            </Button>
            <Button
              variant={statusFilter === "com_atraso" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("com_atraso")}
              className={statusFilter === "com_atraso" ? "" : "text-destructive border-destructive/40"}
            >
              Com Atraso ({stats.totalComAtraso})
            </Button>
            <Button
              variant={statusFilter === "sem_ativas" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("sem_ativas")}
            >
              Sem Cobranças Ativas ({stats.totalSemAtivas})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela Detalhada de Clientes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="text-base font-semibold">
              Listagem de Clientes ({clientesFiltrados.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Clique em uma linha para expandir e ver as cobranças ativas individuais do cliente.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground tracking-wide">
                <tr>
                  <th className="w-8 px-3 py-3"></th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Contato / Doc</th>
                  <th className="text-center px-4 py-3">Cobranças Ativas</th>
                  <th className="text-right px-4 py-3">Valor em Aberto</th>
                  <th className="text-left px-4 py-3">Próximo Venc.</th>
                  <th className="text-left px-4 py-3">Situação</th>
                  <th className="text-right px-4 py-3">Histórico Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clientesFiltrados.map((cli) => {
                  const isExpanded = expandedIds.has(cli.id);
                  return (
                    <Fragment key={cli.id}>
                      <tr
                        onClick={() => toggleExpand(cli.id)}
                        className={`hover:bg-muted/30 cursor-pointer transition-colors ${
                          isExpanded ? "bg-muted/20" : ""
                        }`}
                      >
                        <td className="px-3 py-3 text-center text-muted-foreground">
                          {cli.totalAtivas > 0 ? (
                            isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )
                          ) : (
                            <span className="inline-block w-4" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-sm">{cli.nome}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge
                              variant="outline"
                              className={
                                cli.ativo
                                  ? "bg-success/10 text-success border-success/30 text-[10px] py-0"
                                  : "bg-muted text-muted-foreground text-[10px] py-0"
                              }
                            >
                              {cli.ativo ? "Ativo" : "Inativo"}
                            </Badge>
                            {cli.totalRecorrentes > 0 && (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] py-0">
                                {cli.totalRecorrentes} recorrência(s)
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="text-muted-foreground">{cli.telefone || "—"}</div>
                          {cli.documento && (
                            <div className="text-xs text-muted-foreground font-mono">{cli.documento}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {cli.totalAtivas > 0 ? (
                            <div className="inline-flex flex-col items-center">
                              <Badge variant="secondary" className="font-bold">
                                {cli.totalAtivas} ativa{cli.totalAtivas > 1 ? "s" : ""}
                              </Badge>
                              {(cli.totalAtrasadas > 0 || cli.totalEmDia > 0) && (
                                <span className="text-[11px] text-muted-foreground mt-0.5">
                                  {cli.totalEmDia > 0 && <span className="text-success">{cli.totalEmDia} em dia</span>}
                                  {cli.totalEmDia > 0 && cli.totalAtrasadas > 0 && " • "}
                                  {cli.totalAtrasadas > 0 && <span className="text-destructive font-semibold">{cli.totalAtrasadas} atrasada(s)</span>}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className={`font-bold text-sm ${cli.valorAtivo > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                            {brl(cli.valorAtivo)}
                          </div>
                          {cli.valorAtrasado > 0 && (
                            <div className="text-[11px] text-destructive font-medium">
                              ({brl(cli.valorAtrasado)} em atraso)
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {cli.proximoVencimento ? (
                            <div>
                              <div className="font-medium">{fmtDate(cli.proximoVencimento)}</div>
                              {cli.maiorAtrasoDias > 0 && (
                                <div className="text-[11px] text-destructive font-medium">
                                  Atraso: {cli.maiorAtrasoDias} dias
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {cli.situacao === "em_dia" && (
                            <Badge variant="outline" className="bg-success/15 text-success border-success/30 gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Em dia
                            </Badge>
                          )}
                          {cli.situacao === "atrasado" && (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 gap-1 font-semibold">
                              <AlertCircle className="h-3 w-3" /> Em atraso
                            </Badge>
                          )}
                          {cli.situacao === "sem_cobrancas" && (
                            <Badge variant="outline" className="bg-muted text-muted-foreground">
                              Sem cobrança ativa
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          <div className="text-success font-medium">{brl(cli.valorPago)}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {cli.totalPagas} quitada{cli.totalPagas > 1 ? "s" : ""}
                          </div>
                        </td>
                      </tr>

                      {/* Linha Expansível com as cobranças ativas do cliente */}
                      {isExpanded && (
                        <tr className="bg-muted/15">
                          <td colSpan={8} className="p-4 pl-12">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  Cobranças Ativas de {cli.nome} ({cli.totalAtivas})
                                </div>
                                {cli.telefone && (
                                  <a
                                    href={waLink(
                                      cli.telefone,
                                      `Olá ${cli.nome}, tudo bem? Entramos em contato para verificar suas cobranças em aberto no valor total de ${brl(cli.valorAtivo)}.`
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1.5 text-xs text-success hover:underline font-medium"
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" /> Cobrar via WhatsApp
                                  </a>
                                )}
                              </div>

                              {cli.cobrancasAtivas.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">
                                  Nenhuma cobrança ativa no momento.
                                </p>
                              ) : (
                                <div className="rounded-md border bg-background overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead className="bg-muted/40 text-muted-foreground uppercase">
                                      <tr>
                                        <th className="text-left px-3 py-2">Descrição</th>
                                        <th className="text-left px-3 py-2">Categoria</th>
                                        <th className="text-left px-3 py-2">Vencimento</th>
                                        <th className="text-right px-3 py-2">Valor</th>
                                        <th className="text-left px-3 py-2">Status</th>
                                        <th className="text-center px-3 py-2">Ação</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                      {cli.cobrancasAtivas.map((cob: any) => {
                                        const st = effectiveStatus(cob.vencimento, cob.status);
                                        const diasAtraso = st === "atrasado" ? daysBetween(cob.vencimento, today) : 0;
                                        return (
                                          <tr key={cob.id} className="hover:bg-muted/20">
                                            <td className="px-3 py-2 font-medium">
                                              {cob.descricao}
                                              {cob.recorrente && (
                                                <Badge variant="outline" className="ml-1.5 text-[9px] py-0">
                                                  Recorrente
                                                </Badge>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 text-muted-foreground">
                                              {cob.categorias?.nome || "Sem categoria"}
                                            </td>
                                            <td className="px-3 py-2 font-medium">
                                              {fmtDate(cob.vencimento)}
                                              {st === "atrasado" && (
                                                <span className="text-destructive font-normal ml-1">
                                                  ({diasAtraso}d de atraso)
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 text-right font-bold">
                                              {brl(cob.valor)}
                                            </td>
                                            <td className="px-3 py-2">
                                              <Badge
                                                variant="outline"
                                                className={
                                                  st === "atrasado"
                                                    ? "bg-destructive/10 text-destructive border-destructive/30"
                                                    : "bg-warning/15 text-warning-foreground border-warning/30"
                                                }
                                              >
                                                {st === "atrasado" ? "Atrasado" : "Pendente"}
                                              </Badge>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                              {cli.telefone && (
                                                <a
                                                  href={waLink(
                                                    cli.telefone,
                                                    `Olá ${cli.nome}! Lembramos do vencimento da sua cobrança "${cob.descricao}" no valor de ${brl(cob.valor)} com vencimento em ${fmtDate(cob.vencimento)}.`
                                                  )}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="inline-flex items-center text-primary hover:underline text-xs"
                                                >
                                                  <MessageSquare className="h-3 w-3 mr-1" /> Notificar
                                                </a>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

                {clientesFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                      Nenhum cliente encontrado com os filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── CADASTROS ────────────────────────────────────────────────────────────────
function Cadastros({ from, to }: { from: string; to: string }) {
  const { data = [] } = useQuery({
    queryKey: ["rel-cad", from, to],
    queryFn: async () => ((await supabase.from("clientes").select("*, cobrancas(id, valor)")
      .gte("created_at", from + "T00:00:00").lte("created_at", to + "T23:59:59").order("created_at", { ascending: false })).data ?? []) as any[],
  });

  const { data: total = [] } = useQuery({
    queryKey: ["cad-total"],
    queryFn: async () => (await supabase.from("clientes").select("id, ativo")).data ?? [],
  });

  const ativos = total.filter((c: any) => c.ativo).length;
  const inativos = total.length - ativos;

  const ranking = useMemo(() => {
    return [...data]
      .map((c: any) => ({ nome: c.nome, qtd: c.cobrancas?.length ?? 0, total: (c.cobrancas ?? []).reduce((s: number, x: any) => s + Number(x.valor), 0) }))
      .sort((a, b) => b.total - a.total).slice(0, 10);
  }, [data]);

  const pieData = [
    { name: "Ativos", value: ativos },
    { name: "Inativos", value: inativos },
  ];

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <StatBox label="Novos no período" value={data.length.toString()} tone="info" icon={Users} />
        <StatBox label="Ativos (total)" value={ativos.toString()} tone="success" icon={Users} />
        <StatBox label="Inativos (total)" value={inativos.toString()} icon={Users} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Ativos vs Inativos</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                  <Cell fill="hsl(142, 76%, 36%)" />
                  <Cell fill="hsl(215, 14%, 65%)" />
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top clientes por volume</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranking} layout="vertical">
                <XAxis type="number" tickFormatter={(v) => `R$${v}`} />
                <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => brl(v)} />
                <Bar dataKey="total" fill="hsl(221, 83%, 53%)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Cadastros do período</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportCSV("cadastros.csv", data.map((c: any) => ({
            nome: c.nome, telefone: c.telefone, email: c.email ?? "", documento: c.documento ?? "",
            ativo: c.ativo ? "Sim" : "Não", cadastrado: fmtDate(c.created_at),
          })), [
            { key: "nome", label: "Nome" }, { key: "telefone", label: "Telefone" },
            { key: "email", label: "Email" }, { key: "documento", label: "Documento" },
            { key: "ativo", label: "Ativo" }, { key: "cadastrado", label: "Cadastrado em" },
          ])}><Download className="h-4 w-4 mr-2" /> Exportar CSV</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Telefone</th><th className="text-left px-4 py-3">Cadastrado</th><th className="text-left px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y">
              {data.map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.nome}</td>
                  <td className="px-4 py-3">{c.telefone}</td>
                  <td className="px-4 py-3">{fmtDate(c.created_at)}</td>
                  <td className="px-4 py-3"><Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativo" : "Inativo"}</Badge></td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">Nenhum cadastro no período</td></tr>}
            </tbody>
          </table>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── INADIMPLÊNCIA ────────────────────────────────────────────────────────────
function Inadimplencia() {
  const { data = [] } = useQuery({
    queryKey: ["rel-inad"],
    queryFn: async () => ((await supabase.from("cobrancas").select("*, clientes(nome, telefone)")
      .eq("status", "pendente").lt("vencimento", todayISO()).order("vencimento")).data ?? []) as any[],
  });

  const total = data.reduce((s, c) => s + Number(c.valor), 0);
  const today = todayISO();

  // Aging: faixas de inadimplência
  const aging = useMemo(() => {
    const faixas = [
      { label: "1–30 dias", min: 1, max: 30, itens: [] as any[], total: 0 },
      { label: "31–60 dias", min: 31, max: 60, itens: [] as any[], total: 0 },
      { label: "61–90 dias", min: 61, max: 90, itens: [] as any[], total: 0 },
      { label: "Acima de 90 dias", min: 91, max: Infinity, itens: [] as any[], total: 0 },
    ];
    data.forEach((c) => {
      const dias = daysBetween(c.vencimento, today);
      for (const f of faixas) {
        if (dias >= f.min && dias <= f.max) {
          f.itens.push(c);
          f.total += Number(c.valor);
          break;
        }
      }
    });
    return faixas;
  }, [data, today]);

  // Inadimplência por cliente
  const porCliente = useMemo(() => {
    const map: Record<string, { nome: string; qtd: number; total: number; maxDias: number }> = {};
    data.forEach((c) => {
      const nome = c.clientes?.nome ?? "Sem nome";
      const dias = daysBetween(c.vencimento, today);
      map[nome] = map[nome] ?? { nome, qtd: 0, total: 0, maxDias: 0 };
      map[nome].qtd += 1;
      map[nome].total += Number(c.valor);
      map[nome].maxDias = Math.max(map[nome].maxDias, dias);
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [data, today]);

  const agingData = aging.map((f) => ({ faixa: f.label, valor: f.total, qtd: f.itens.length }));

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Total Inadimplente" value={brl(total)} tone="destructive" icon={AlertCircle} />
        <StatBox label="Cobranças em atraso" value={data.length.toString()} tone="destructive" icon={AlertCircle} />
        <StatBox label="Clientes inadimplentes" value={new Set(data.map((c) => c.cliente_id)).size.toString()} tone="warning" icon={Users} />
        <StatBox label="Maior atraso" value={data.length > 0 ? `${Math.max(...data.map((c) => daysBetween(c.vencimento, today)))} dias` : "—"} tone="destructive" icon={AlertCircle} />
      </div>

      {/* Gráfico de aging */}
      <Card>
        <CardHeader><CardTitle>Aging — Faixas de Inadimplência</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {aging.map((f) => (
              <div key={f.label} className="rounded-lg border p-3 text-center">
                <div className="text-xs text-muted-foreground font-medium mb-1">{f.label}</div>
                <div className="text-xl font-bold text-destructive">{brl(f.total)}</div>
                <div className="text-xs text-muted-foreground">{f.itens.length} cobranças</div>
              </div>
            ))}
          </div>
          {agingData.some((d) => d.valor > 0) && (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agingData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="faixa" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `R$${v}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => brl(v)} />
                  <Bar dataKey="valor" fill="hsl(0, 84%, 60%)" name="Valor" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top clientes inadimplentes */}
      {porCliente.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Top Clientes Inadimplentes</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-right px-4 py-3">Cobranças</th>
                  <th className="text-right px-4 py-3">Total em Atraso</th>
                  <th className="text-right px-4 py-3">Maior Atraso</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {porCliente.map((c) => (
                  <tr key={c.nome} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{c.nome}</td>
                    <td className="px-4 py-3 text-right">{c.qtd}</td>
                    <td className="px-4 py-3 text-right font-semibold text-destructive">{brl(c.total)}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="outline" className={c.maxDias > 60 ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning-foreground"}>
                        {c.maxDias} dias
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Detalhamento completo</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportCSV("inadimplencia.csv", data.map((c: any) => ({
            cliente: c.clientes?.nome, telefone: c.clientes?.telefone, descricao: c.descricao,
            valor: c.valor, vencimento: c.vencimento, atraso_dias: daysBetween(c.vencimento, today),
          })), [
            { key: "cliente", label: "Cliente" }, { key: "telefone", label: "Telefone" },
            { key: "descricao", label: "Descrição" }, { key: "valor", label: "Valor" },
            { key: "vencimento", label: "Vencimento" }, { key: "atraso_dias", label: "Dias em atraso" },
          ])}><Download className="h-4 w-4 mr-2" /> Exportar CSV</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Descrição</th>
                <th className="text-right px-4 py-3">Valor</th>
                <th className="text-left px-4 py-3">Vencimento</th>
                <th className="text-right px-4 py-3">Atraso</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((c: any) => {
                const dias = daysBetween(c.vencimento, today);
                return (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{c.clientes?.nome}</td>
                    <td className="px-4 py-3">{c.descricao}</td>
                    <td className="px-4 py-3 text-right font-semibold text-destructive">{brl(c.valor)}</td>
                    <td className="px-4 py-3">{fmtDate(c.vencimento)}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="outline" className={dias > 60 ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-warning/15 text-warning-foreground border-warning/30"}>
                        {dias} dias
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {data.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum inadimplente 🎉</td></tr>}
            </tbody>
          </table>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tabela Cobranças (reutilizável) ──────────────────────────────────────────
function TabelaCobrancas({ items }: { items: any[] }) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full">
      <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
        <tr>
          <th className="text-left px-4 py-3">Cliente</th>
          <th className="text-left px-4 py-3">Descrição</th>
          <th className="text-right px-4 py-3">Valor</th>
          <th className="text-left px-4 py-3">Vencimento</th>
          <th className="text-left px-4 py-3">Pagamento</th>
          <th className="text-left px-4 py-3">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {items.map((c: any) => {
          const st = effectiveStatus(c.vencimento, c.status);
          return (
            <tr key={c.id} className="hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">{c.clientes?.nome}</td>
              <td className="px-4 py-3">{c.descricao}</td>
              <td className="px-4 py-3 text-right font-semibold">{brl(c.valor)}</td>
              <td className="px-4 py-3">{fmtDate(c.vencimento)}</td>
              <td className="px-4 py-3 text-muted-foreground">{c.data_pagamento ? fmtDate(c.data_pagamento) : "—"}</td>
              <td className="px-4 py-3">
                <Badge variant="outline" className={
                  st === "pago" ? "bg-success/15 text-success border-success/30" :
                  st === "atrasado" ? "bg-destructive/10 text-destructive border-destructive/30" :
                  "bg-warning/15 text-warning-foreground"
                }>{st}</Badge>
              </td>
            </tr>
          );
        })}
        {items.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Sem dados no período</td></tr>}
      </tbody>
    </table>
    </div>
  );
}

// ─── StatBox ──────────────────────────────────────────────────────────────────
function StatBox({ label, value, tone, icon: Icon, subtext }: any) {
  const tc: any = {
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
    warning: "text-warning-foreground bg-warning/15",
    info: "text-info bg-info/10",
  };
  return (
    <Card>
      <CardContent className="pt-6 flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
          {subtext && <div className="text-xs text-muted-foreground mt-1">{subtext}</div>}
        </div>
        <div className={"h-10 w-10 rounded-lg flex items-center justify-center shrink-0 " + (tc[tone] ?? "bg-muted text-muted-foreground")}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
