import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, TrendingUp, TrendingDown, Users, AlertCircle } from "lucide-react";
import { brl, fmtDate, effectiveStatus, todayISO, daysBetween } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [
    { title: "Relatórios — CobraZap" },
    { name: "description", content: "Relatórios de faturamento, movimentações financeiras, cadastros e inadimplência." },
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
        <PageHeader title="Relatórios" subtitle="Análise financeira e de cadastros do seu negócio" />

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

        <Tabs defaultValue="faturamento">
          <TabsList>
            <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
            <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
            <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
            <TabsTrigger value="inadimplencia">Inadimplência</TabsTrigger>
          </TabsList>

          <TabsContent value="faturamento"><Faturamento from={from} to={to} /></TabsContent>
          <TabsContent value="movimentacoes"><Movimentacoes from={from} to={to} /></TabsContent>
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
    return { total: sum(data), pago: sum(pago), pendente: sum(pendente), atrasado: sum(atrasado), qtd: data.length };
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
        <StatBox label="Recebido" value={brl(stats.pago)} tone="success" icon={TrendingUp} />
        <StatBox label="A receber" value={brl(stats.pendente)} tone="warning" icon={TrendingDown} />
        <StatBox label="Em atraso" value={brl(stats.atrasado)} tone="destructive" icon={AlertCircle} />
      </div>

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
              <Bar dataKey="pago" fill="var(--color-success)" name="Recebido" />
              <Bar dataKey="pendente" fill="var(--color-warning)" name="Pendente" />
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
                </tr>
              </thead>
              <tbody className="divide-y">
                {byCategoria.map((c) => (
                  <tr key={c.categoria} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{c.categoria}</td>
                    <td className="px-4 py-3 text-right">{c.qtd}</td>
                    <td className="px-4 py-3 text-right font-semibold">{brl(c.total)}</td>
                    <td className="px-4 py-3 text-right text-success">{brl(c.recebido)}</td>
                  </tr>
                ))}
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

function Movimentacoes({ from, to }: { from: string; to: string }) {
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "mensalidades" | "entradas" | "saidas">("todos");

  const { data: movData = [] } = useQuery({
    queryKey: ["rel-mov", from, to],
    queryFn: async () => ((await supabase.from("movimentacoes").select("*, clientes(nome)")
      .gte("data", from).lte("data", to).order("data", { ascending: false })).data ?? []) as any[],
  });

  const { data: cobData = [] } = useQuery({
    queryKey: ["rel-cob-pagas", from, to],
    queryFn: async () => ((await supabase.from("cobrancas").select("*, clientes(nome)").eq("status", "pago")
      .gte("data_pagamento", from).lte("data_pagamento", to)).data ?? []) as any[],
  });

  const { data: contasPagasData = [] } = useQuery({
    queryKey: ["rel-contas-pagas", from, to],
    queryFn: async () => ((await supabase.from("contas_pagar").select("*").eq("status", "pago")
      .gte("pago_em", from).lte("pago_em", to)).data ?? []) as any[],
  });

  const allItems = useMemo(() => {
    const list: {
      id: string;
      data: string;
      tipo: "entrada" | "saida";
      origem: "mensalidade" | "entrada" | "saida";
      origemRotulo: string;
      descricao: string;
      cliente: string;
      valor: number;
    }[] = [];

    // General movimentacoes
    movData.forEach((m: any) => {
      list.push({
        id: `mov-${m.id}`,
        data: m.data,
        tipo: m.tipo,
        origem: m.tipo === "entrada" ? "entrada" : "saida",
        origemRotulo: m.tipo === "entrada" ? "Entrada Geral" : "Saída Geral",
        descricao: m.descricao,
        cliente: m.clientes?.nome ?? "—",
        valor: Number(m.valor),
      });
    });

    // Paid subscriptions / charges
    cobData.forEach((c: any) => {
      list.push({
        id: `cob-${c.id}`,
        data: c.data_pagamento ?? c.vencimento,
        tipo: "entrada",
        origem: "mensalidade",
        origemRotulo: "Mensalidade Recebida",
        descricao: c.descricao,
        cliente: c.clientes?.nome ?? "—",
        valor: Number(c.valor),
      });
    });

    // Paid bills/payables
    contasPagasData.forEach((cp: any) => {
      list.push({
        id: `cp-${cp.id}`,
        data: cp.pago_em ?? cp.vencimento,
        tipo: "saida",
        origem: "saida",
        origemRotulo: "Despesa / Conta Paga",
        descricao: cp.descricao,
        cliente: cp.fornecedor ? `Fornecedor: ${cp.fornecedor}` : "—",
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

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Mensalidades Recebidas" value={brl(totalMensalidades)} tone="success" icon={TrendingUp} />
        <StatBox label="Total Entradas" value={brl(totalEntradas)} tone="success" icon={TrendingUp} />
        <StatBox label="Total Saídas" value={brl(totalSaidas)} tone="destructive" icon={TrendingDown} />
        <StatBox label="Saldo no Período" value={brl(saldo)} tone={saldo >= 0 ? "success" : "destructive"} icon={TrendingUp} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={tipoFiltro === "todos" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("todos")}>
          Todos os Lançamentos ({allItems.length})
        </Button>
        <Button variant={tipoFiltro === "mensalidades" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("mensalidades")}>
          Mensalidades Recebidas ({allItems.filter((i) => i.origem === "mensalidade").length})
        </Button>
        <Button variant={tipoFiltro === "entradas" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("entradas")}>
          Todas as Entradas ({allItems.filter((i) => i.tipo === "entrada").length})
        </Button>
        <Button variant={tipoFiltro === "saidas" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("saidas")}>
          Todas as Saídas ({allItems.filter((i) => i.tipo === "saida").length})
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
              {filteredItems.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum recebimento ou lançamento encontrado no período</td></tr>}
            </tbody>
          </table>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
                  <Cell fill="var(--color-success)" />
                  <Cell fill="var(--color-muted-foreground)" />
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
                <YAxis type="category" dataKey="nome" width={100} />
                <Tooltip formatter={(v: any) => brl(v)} />
                <Bar dataKey="total" fill="var(--color-primary)" />
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

function Inadimplencia() {
  const { data = [] } = useQuery({
    queryKey: ["rel-inad"],
    queryFn: async () => ((await supabase.from("cobrancas").select("*, clientes(nome, telefone)")
      .eq("status", "pendente").lt("vencimento", todayISO()).order("vencimento")).data ?? []) as any[],
  });

  const total = data.reduce((s, c) => s + Number(c.valor), 0);
  const today = todayISO();

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <StatBox label="Cobranças em atraso" value={data.length.toString()} tone="destructive" icon={AlertCircle} />
        <StatBox label="Valor total inadimplente" value={brl(total)} tone="destructive" icon={AlertCircle} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Detalhamento</CardTitle>
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
              <tr><th className="text-left px-4 py-3">Cliente</th><th className="text-left px-4 py-3">Descrição</th><th className="text-right px-4 py-3">Valor</th><th className="text-left px-4 py-3">Vencimento</th><th className="text-right px-4 py-3">Atraso</th></tr>
            </thead>
            <tbody className="divide-y">
              {data.map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.clientes?.nome}</td>
                  <td className="px-4 py-3">{c.descricao}</td>
                  <td className="px-4 py-3 text-right font-semibold text-destructive">{brl(c.valor)}</td>
                  <td className="px-4 py-3">{fmtDate(c.vencimento)}</td>
                  <td className="px-4 py-3 text-right text-destructive font-medium">{daysBetween(c.vencimento, today)} dias</td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum inadimplente 🎉</td></tr>}
            </tbody>
          </table>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TabelaCobrancas({ items }: { items: any[] }) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full">
      <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
        <tr><th className="text-left px-4 py-3">Cliente</th><th className="text-left px-4 py-3">Descrição</th><th className="text-right px-4 py-3">Valor</th><th className="text-left px-4 py-3">Vencimento</th><th className="text-left px-4 py-3">Status</th></tr>
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
              <td className="px-4 py-3"><Badge variant="outline">{st}</Badge></td>
            </tr>
          );
        })}
        {items.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Sem dados no período</td></tr>}
      </tbody>
    </table>
    </div>
  );
}

function StatBox({ label, value, tone, icon: Icon }: any) {
  const tc: any = {
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
    warning: "text-warning-foreground bg-warning/15",
    info: "text-info bg-info/10",
  };
  return (
    <Card>
      <CardContent className="pt-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
        </div>
        <div className={"h-10 w-10 rounded-lg flex items-center justify-center " + (tc[tone] ?? "bg-muted text-muted-foreground")}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
