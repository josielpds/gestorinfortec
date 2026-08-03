import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, DollarSign, AlertTriangle, CheckCircle2, Clock, TrendingUp, MessageCircle, Wallet, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { brl, fmtDate, todayISO, effectiveStatus } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { MonthFilter, formatMonthLabel } from "@/components/MonthFilter";

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
      const [clientesRes, cobrancasRes, contasPagarRes] = await Promise.all([
        supabase.from("clientes").select("id, ativo"),
        supabase.from("cobrancas").select("id, cliente_id, descricao, valor, vencimento, status, data_pagamento, clientes(nome)").order("vencimento"),
        supabase.from("contas_pagar").select("id, descricao, fornecedor, valor, vencimento, status, pago_em, categoria").order("vencimento"),
      ]);
      return {
        clientes: clientesRes.data ?? [],
        cobrancas: (cobrancasRes.data ?? []) as any[],
        contasPagar: (contasPagarRes.data ?? []) as any[],
      };
    },
  });

  const clientes = data?.clientes ?? [];
  const cobrancas = data?.cobrancas ?? [];
  const contasPagar = data?.contasPagar ?? [];

  const isAll = selectedMonth === "todos";

  // Filter cobrancas and contasPagar by selected month
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

  // Values A Receber (pending in selected month vs total)
  const aReceberMes = cobrancasMes.filter((c) => c.status === "pendente" || effectiveStatus(c.vencimento, c.status) === "atrasado").reduce((s, c) => s + Number(c.valor), 0);
  const aReceberTotal = cobrancas.filter((c) => c.status === "pendente" || effectiveStatus(c.vencimento, c.status) === "atrasado").reduce((s, c) => s + Number(c.valor), 0);

  // Values A Pagar (pending in selected month vs total)
  const aPagarMes = contasPagarMes.filter((cp) => cp.status === "pendente" || (cp.status === "pendente" && cp.vencimento < today)).reduce((s, cp) => s + Number(cp.valor), 0);
  const aPagarTotal = contasPagar.filter((cp) => cp.status === "pendente" || (cp.status === "pendente" && cp.vencimento < today)).reduce((s, cp) => s + Number(cp.valor), 0);

  // Received in month
  const recebidoMes = cobrancasPagasMes.reduce((s, c) => s + Number(c.valor), 0);

  // Paid out in month
  const pagoMes = contasPagasMes.reduce((s, cp) => s + Number(cp.valor), 0);

  // Overdue
  const emAtrasoReceber = cobrancas.filter((c) => effectiveStatus(c.vencimento, c.status) === "atrasado").reduce((s, c) => s + Number(c.valor), 0);
  const emAtrasoPagar = contasPagar.filter((cp) => cp.status === "pendente" && cp.vencimento < today).reduce((s, cp) => s + Number(cp.valor), 0);

  const atrasadas = cobrancas.filter((c) => effectiveStatus(c.vencimento, c.status) === "atrasado");
  const vencemHoje = cobrancas.filter((c) => c.status === "pendente" && c.vencimento === today);
  const vencem3dias = cobrancas.filter((c) => {
    if (c.status !== "pendente") return false;
    const d = new Date(c.vencimento + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime();
    const dias = Math.floor(d / 86400000);
    return dias > 0 && dias <= 3;
  });

  // Group upcoming charges per client
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

  // Group upcoming payables
  const proximasContas = contasPagarMes
    .filter((cp) => cp.status === "pendente")
    .slice()
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .slice(0, 5);

  return (
    <AppLayout>
      <div className="p-8 max-w-[1400px]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <PageHeader title="Dashboard" subtitle={`Visão geral do seu sistema — ${formatMonthLabel(selectedMonth)}`} />
          <MonthFilter selectedMonth={selectedMonth} onChange={setSelectedMonth} allowAll={true} />
        </div>

        {/* Primary Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Valores a Receber"
            value={brl(aReceberMes)}
            subtext={!isAll ? `Total acumulado: ${brl(aReceberTotal)}` : undefined}
            icon={ArrowDownRight}
            tone="info"
          />
          <StatCard
            label="Valores a Pagar"
            value={brl(aPagarMes)}
            subtext={!isAll ? `Total acumulado: ${brl(aPagarTotal)}` : undefined}
            icon={ArrowUpRight}
            tone="warning"
          />
          <StatCard
            label="Recebido (Mês)"
            value={brl(recebidoMes)}
            icon={CheckCircle2}
            tone="success"
          />
          <StatCard
            label="Pago (Mês)"
            value={brl(pagoMes)}
            icon={Wallet}
            tone="neutral"
          />
        </div>

        {/* Secondary balance & summary card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-card border shadow-sm">
            <CardContent className="pt-6">
              <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wide">Saldo Previsto do Mês</div>
              <div className={`text-2xl font-bold mt-2 ${aReceberMes - aPagarMes >= 0 ? "text-success" : "text-destructive"}`}>
                {brl(aReceberMes - aPagarMes)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Valores a receber menos valores a pagar no período</p>
            </CardContent>
          </Card>

          <Card className="bg-card border shadow-sm">
            <CardContent className="pt-6">
              <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wide">Saldo Realizado (Caixa)</div>
              <div className={`text-2xl font-bold mt-2 ${recebidoMes - pagoMes >= 0 ? "text-success" : "text-destructive"}`}>
                {brl(recebidoMes - pagoMes)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Valores recebidos menos despesas pagas no período</p>
            </CardContent>
          </Card>

          <Card className="bg-card border shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wide">Clientes Ativos</div>
                  <div className="text-2xl font-bold mt-2">{ativos}</div>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-info/10 text-info">
                  <Users className="h-5 w-5" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Em atraso total: <span className="font-semibold text-destructive">{brl(emAtrasoReceber)}</span></p>
            </CardContent>
          </Card>
        </div>

        {/* Action Cards */}
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

        {/* Next Charges & Payables Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Contas a Receber ({formatMonthLabel(selectedMonth)})</CardTitle>
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
                  {proximas.map((g) => (
                    <div key={g.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-medium">{g.nome}</div>
                        <div className="text-sm text-muted-foreground">
                          Vencimento em {fmtDate(g.prox)}
                          {g.count > 1 && ` · ${g.count} cobranças`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-primary">{brl(g.total)}</div>
                        {g.count > 1 && (
                          <div className="text-xs text-muted-foreground">próxima {brl(g.proxValor)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><ArrowUpRight className="h-5 w-5 text-warning-foreground" /> Contas a Pagar ({formatMonthLabel(selectedMonth)})</CardTitle>
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
                  {proximasContas.map((cp: any) => (
                    <div key={cp.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-medium">{cp.descricao}</div>
                        <div className="text-sm text-muted-foreground">
                          {cp.fornecedor ? `Fornecedor: ${cp.fornecedor} · ` : ""}Vencimento em {fmtDate(cp.vencimento)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-destructive">{brl(cp.valor)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({ label, value, subtext, icon: Icon, tone }: any) {
  const toneClass = {
    info: "bg-info/10 text-info",
    warning: "bg-warning/15 text-warning-foreground",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/15 text-success",
    neutral: "bg-muted text-muted-foreground",
  }[tone as string] ?? "bg-muted text-muted-foreground";

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wide">{label}</div>
            <div className="text-2xl font-bold mt-2">{value}</div>
            {subtext && <div className="text-xs text-muted-foreground mt-1">{subtext}</div>}
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
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
