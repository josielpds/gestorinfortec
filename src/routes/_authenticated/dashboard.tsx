import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, DollarSign, AlertTriangle, CheckCircle2, Clock, TrendingUp, TrendingDown, MessageCircle, Wallet, ArrowDownRight, ArrowUpRight, BarChart3 } from "lucide-react";
import { brl, fmtDate, todayISO, effectiveStatus } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MonthFilter, formatMonthLabel } from "@/components/MonthFilter";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — CobraZap" },
      { name: "description", content: "Visão geral das cobranças, contas a pagar, recebimentos e clientes." },
    ],
  }),
  component: Dashboard,
});

export function Dashboard() {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => todayISO().slice(0, 7));
  const today = todayISO();

  const { data } = useQuery({
    queryKey: ["dashboard-data"],
    queryFn: async () => {
      const [clientesRes, cobrancasRes, contasPagarRes, movRes] = await Promise.all([
        supabase.from("clientes").select("id, ativo"),
        supabase.from("cobrancas").select("id, cliente_id, descricao, valor, vencimento, status, data_pagamento, clientes(nome)").order("vencimento"),
        supabase.from("contas_pagar").select("id, descricao, fornecedor, valor, vencimento, status, pago_em, categoria").order("vencimento"),
        supabase.from("movimentacoes").select("tipo, valor, status, data"),
      ]);
      return {
        clientes: clientesRes.data ?? [],
        cobrancas: (cobrancasRes.data ?? []) as any[],
        contasPagar: (contasPagarRes.data ?? []) as any[],
        movimentacoes: (movRes.data ?? []) as any[],
      };
    },
  });

  const clientes = data?.clientes ?? [];
  const cobrancas = data?.cobrancas ?? [];
  const contasPagar = data?.contasPagar ?? [];
  const movimentacoes = data?.movimentacoes ?? [];

  const isAll = selectedMonth === "todos";

  // Filtrar por mês
  const cobrancasMes = isAll
    ? cobrancas
    : cobrancas.filter((c) => (c.vencimento ?? "").startsWith(selectedMonth));

  const cobrancasPagasMes = isAll
    ? cobrancas.filter((c) => c.status === "pago")
    : cobrancas.filter((c) => c.status === "pago" && ((c.data_pagamento ?? c.vencimento ?? "").startsWith(selectedMonth)));

  const contasPagarMes = isAll
    ? contasPagar
    : contasPagar.filter((cp) => (cp.vencimento ?? "").startsWith(selectedMonth));

  const contasPagasMes = isAll
    ? contasPagar.filter((cp) => cp.status === "pago")
    : contasPagar.filter((cp) => cp.status === "pago" && ((cp.pago_em ?? cp.vencimento ?? "").startsWith(selectedMonth)));

  const ativos = clientes.filter((c: any) => c.ativo).length;
  const inativos = clientes.length - ativos;

  // Valores a receber (apenas pendentes no período — NÃO contar atrasados duas vezes)
  const aReceberMes = cobrancasMes
    .filter((c) => c.status === "pendente")
    .reduce((s, c) => s + Number(c.valor), 0);

  const emAtrasoReceber = cobrancas
    .filter((c) => effectiveStatus(c.vencimento, c.status) === "atrasado")
    .reduce((s, c) => s + Number(c.valor), 0);

  // Valores a pagar (pendentes no período)
  const aPagarMes = contasPagarMes
    .filter((cp) => cp.status === "pendente")
    .reduce((s, cp) => s + Number(cp.valor), 0);

  const emAtrasoPagar = contasPagar
    .filter((cp) => cp.status === "pendente" && cp.vencimento < today)
    .reduce((s, cp) => s + Number(cp.valor), 0);

  // Recebido e pago no período
  const recebidoMes = cobrancasPagasMes.reduce((s, c) => s + Number(c.valor), 0);
  const pagoMes = contasPagasMes.reduce((s, cp) => s + Number(cp.valor), 0);

  // Saldo realizado do caixa
  const saldoRealizado = recebidoMes - pagoMes;

  // Taxa de recebimento do mês
  const totalFaturadoMes = cobrancasMes.reduce((s, c) => s + Number(c.valor), 0);
  const taxaRecebimento = totalFaturadoMes > 0 ? Math.round((recebidoMes / totalFaturadoMes) * 100) : 0;

  // Lançamentos manuais de entrada pendentes
  // (apenas conta se o status estiver explicitamente "pendente" — não conta ausência de coluna)
  const pendenteReceberManual = movimentacoes
    .filter((m) => m.tipo === "entrada" && m.status === "pendente")
    .reduce((s, m) => s + Number(m.valor), 0);

  const atrasadas = cobrancas.filter((c) => effectiveStatus(c.vencimento, c.status) === "atrasado");
  const vencemHoje = cobrancas.filter((c) => c.status === "pendente" && c.vencimento === today);
  const vencem3dias = cobrancas.filter((c) => {
    if (c.status !== "pendente") return false;
    const d = new Date(c.vencimento + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime();
    const dias = Math.floor(d / 86400000);
    return dias > 0 && dias <= 3;
  });

  // Gráfico evolução mensal (últimos 6 meses)
  const graficoMensal = useMemo(() => {
    const meses: { key: string; label: string; recebido: number; despesas: number; saldo: number }[] = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" });
      const recebido = cobrancas
        .filter((c) => c.status === "pago" && (c.data_pagamento ?? c.vencimento ?? "").startsWith(key))
        .reduce((s, c) => s + Number(c.valor), 0);
      const despesas = contasPagar
        .filter((cp) => cp.status === "pago" && (cp.pago_em ?? cp.vencimento ?? "").startsWith(key))
        .reduce((s, cp) => s + Number(cp.valor), 0);
      meses.push({ key, label, recebido, despesas, saldo: recebido - despesas });
    }
    return meses;
  }, [cobrancas, contasPagar]);

  // Próximas cobranças a receber no mês
  const porCliente = new Map<
    string,
    { id: string; nome: string; prox: string; proxValor: number; count: number; total: number }
  >();
  cobrancasMes
    .filter((c) => c.status === "pendente" || effectiveStatus(c.vencimento, c.status) === "atrasado")
    .slice()
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .forEach((c) => {
      const key = c.cliente_id ?? c.id;
      const atual = porCliente.get(key);
      if (!atual) {
        porCliente.set(key, {
          id: key,
          nome: c.clientes?.nome ?? "—",
          prox: c.vencimento,
          proxValor: Number(c.valor),
          count: 1,
          total: Number(c.valor),
        });
      } else {
        atual.count += 1;
        atual.total += Number(c.valor);
      }
    });
  const proximas = Array.from(porCliente.values())
    .sort((a, b) => a.prox.localeCompare(b.prox))
    .slice(0, 5);

  // Próximas contas a pagar
  const proximasContas = contasPagarMes
    .filter((cp) => cp.status === "pendente")
    .slice()
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .slice(0, 5);

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <PageHeader title="Dashboard" subtitle={`Visão geral do seu sistema — ${formatMonthLabel(selectedMonth)}`} />
          <MonthFilter selectedMonth={selectedMonth} onChange={setSelectedMonth} allowAll={true} />
        </div>

        {/* Cards de Métricas Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Recebido no Mês"
            value={brl(recebidoMes)}
            subtext={`${taxaRecebimento}% do faturado`}
            icon={CheckCircle2}
            tone="success"
            progress={taxaRecebimento}
          />
          <StatCard
            label="A Receber (Pendente)"
            value={brl(aReceberMes)}
            subtext={emAtrasoReceber > 0 ? `+ ${brl(emAtrasoReceber)} em atraso` : "Sem atrasos"}
            icon={ArrowDownRight}
            tone="info"
          />
          <StatCard
            label="A Pagar (Pendente)"
            value={brl(aPagarMes)}
            subtext={emAtrasoPagar > 0 ? `${brl(emAtrasoPagar)} vencidos` : "Em dia"}
            icon={ArrowUpRight}
            tone="warning"
          />
          <StatCard
            label="Despesas Pagas"
            value={brl(pagoMes)}
            subtext="Contas quitadas no período"
            icon={Wallet}
            tone="neutral"
          />
        </div>

        {/* Saldos + Clientes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-card border shadow-sm">
            <CardContent className="pt-6">
              <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wide">Saldo Previsto do Mês</div>
              <div className={`text-3xl font-bold mt-2 ${aReceberMes - aPagarMes >= 0 ? "text-success" : "text-destructive"}`}>
                {brl(aReceberMes - aPagarMes)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">A receber menos a pagar no período</p>
            </CardContent>
          </Card>

          <Card className={`border shadow-sm ${saldoRealizado >= 0 ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"}`}>
            <CardContent className="pt-6">
              <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wide">Saldo Realizado (Caixa)</div>
              <div className={`text-3xl font-bold mt-2 ${saldoRealizado >= 0 ? "text-success" : "text-destructive"}`}>
                {brl(saldoRealizado)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Recebimentos menos despesas pagas</p>
              {pendenteReceberManual > 0 && (
                <p className="text-xs text-warning-foreground mt-1">⚠ {brl(pendenteReceberManual)} em lançamentos pendentes</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wide">Clientes</div>
                  <div className="text-3xl font-bold mt-2">{ativos}</div>
                  <p className="text-xs text-muted-foreground mt-1">ativos · {inativos} inativos</p>
                </div>
                <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-info/10 text-info">
                  <Users className="h-6 w-6" />
                </div>
              </div>
              {emAtrasoReceber > 0 && (
                <div className="mt-3 flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  <span>{brl(emAtrasoReceber)} em atraso total</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alertas de Ação */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <ActionCard
            tone="destructive"
            icon={AlertTriangle}
            title="Cobranças Atrasadas"
            count={atrasadas.length}
            cta="Disparar cobranças"
            to="/mensagens"
          />
          <ActionCard tone="warning" icon={Clock} title="Vencem Hoje" count={vencemHoje.length} cta="Enviar lembrete" to="/mensagens" />
          <ActionCard tone="info" icon={Clock} title="Vencem em 3 Dias" count={vencem3dias.length} cta="Enviar lembrete preventivo" to="/mensagens" />
        </div>

        {/* Gráfico Evolução Mensal */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Evolução Mensal — Receitas vs Despesas
            </CardTitle>
            <Link to="/relatorios" className="text-sm text-primary hover:underline">Ver DRE completo →</Link>
          </CardHeader>
          <CardContent className="h-64 pr-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={graficoMensal} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: any, name: string) => [brl(v), name === "recebido" ? "Receitas" : name === "despesas" ? "Despesas" : "Saldo"]}
                  labelFormatter={(l) => `Mês: ${l}`}
                />
                <Bar dataKey="recebido" fill="hsl(142, 76%, 36%)" name="Receitas" radius={[3, 3, 0, 0]} />
                <Bar dataKey="despesas" fill="hsl(0, 84%, 60%)" name="Despesas" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Próximas Cobranças + Próximas Contas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-success" /> A Receber ({formatMonthLabel(selectedMonth)})</CardTitle>
              <Link to="/cobrancas" className="text-sm text-primary hover:underline">Ver todas →</Link>
            </CardHeader>
            <CardContent>
              {proximas.length === 0 ? (
                <div className="text-center py-10">
                  <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Nenhuma cobrança a receber no período</p>
                  <Link to="/cobrancas"><Button className="mt-4" size="sm">Nova Cobrança</Button></Link>
                </div>
              ) : (
                <div className="divide-y">
                  {proximas.map((g) => {
                    const isAtrasado = g.prox < today;
                    return (
                      <div key={g.id} className="flex items-center justify-between py-3">
                        <div>
                          <div className="font-medium">{g.nome}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-sm ${isAtrasado ? "text-destructive" : "text-muted-foreground"}`}>
                              {isAtrasado ? "Venceu em" : "Vence em"} {fmtDate(g.prox)}
                            </span>
                            {isAtrasado && <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">Atrasado</Badge>}
                          </div>
                          {g.count > 1 && <div className="text-xs text-muted-foreground">{g.count} cobranças</div>}
                        </div>
                        <div className="text-right">
                          <div className={`font-semibold ${isAtrasado ? "text-destructive" : "text-primary"}`}>{brl(g.total)}</div>
                          {g.count > 1 && <div className="text-xs text-muted-foreground">próxima {brl(g.proxValor)}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><TrendingDown className="h-5 w-5 text-destructive" /> A Pagar ({formatMonthLabel(selectedMonth)})</CardTitle>
              <Link to="/contas-a-pagar" className="text-sm text-primary hover:underline">Ver todas →</Link>
            </CardHeader>
            <CardContent>
              {proximasContas.length === 0 ? (
                <div className="text-center py-10">
                  <Wallet className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Nenhuma conta a pagar no período</p>
                  <Link to="/contas-a-pagar"><Button className="mt-4" size="sm">Nova Conta a Pagar</Button></Link>
                </div>
              ) : (
                <div className="divide-y">
                  {proximasContas.map((cp: any) => {
                    const isAtrasado = cp.vencimento < today;
                    return (
                      <div key={cp.id} className="flex items-center justify-between py-3">
                        <div>
                          <div className="font-medium">{cp.descricao}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-sm ${isAtrasado ? "text-destructive" : "text-muted-foreground"}`}>
                              {cp.fornecedor ? `${cp.fornecedor} · ` : ""}
                              {isAtrasado ? "Venceu em" : "Vence em"} {fmtDate(cp.vencimento)}
                            </span>
                            {isAtrasado && <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">Atrasado</Badge>}
                          </div>
                          {cp.categoria && <div className="text-xs text-muted-foreground">{cp.categoria}</div>}
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-destructive">{brl(cp.valor)}</div>
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
    </AppLayout>
  );
}

function StatCard({ label, value, subtext, icon: Icon, tone, progress }: any) {
  const toneClass = {
    info: "bg-info/10 text-info",
    warning: "bg-warning/15 text-warning-foreground",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/15 text-success",
    neutral: "bg-muted text-muted-foreground",
  }[tone as string] ?? "bg-muted text-muted-foreground";

  const subtextColor = {
    success: "text-success",
    destructive: "text-destructive",
    warning: "text-warning-foreground",
  }[tone as string] ?? "text-muted-foreground";

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wide">{label}</div>
            <div className="text-2xl font-bold mt-2">{value}</div>
            {subtext && <div className={`text-xs mt-1 ${subtextColor}`}>{subtext}</div>}
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ml-2 ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-3">
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="bg-success rounded-full h-1.5 transition-all"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionCard({ tone, icon: Icon, title, count, cta, to }: any) {
  const bg = {
    destructive: "bg-destructive/5 border-destructive/30",
    warning: "bg-warning/10 border-warning/30",
    info: "bg-info/5 border-info/30",
  }[tone as string];
  const text = {
    destructive: "text-destructive",
    warning: "text-warning-foreground",
    info: "text-info",
  }[tone as string];

  return (
    <Link to={to}>
      <Card className={`border ${bg} hover:shadow-md transition-shadow cursor-pointer`}>
        <CardContent className="pt-6">
          <div className={`flex items-center gap-2 font-semibold ${text}`}><Icon className="h-5 w-5" /> {title}</div>
          <div className={`text-3xl font-bold mt-3 ${text}`}>{count}</div>
          <div className={`text-sm mt-1 ${text}`}>{cta}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
