import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, DollarSign, AlertTriangle, CheckCircle2, Clock, TrendingUp, MessageCircle } from "lucide-react";
import { brl, fmtDate, todayISO, effectiveStatus } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — CobraZap" },
      { name: "description", content: "Visão geral das cobranças, recebimentos e clientes." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [clientes, cobrancas] = await Promise.all([
        supabase.from("clientes").select("id, ativo"),
        supabase.from("cobrancas").select("id, cliente_id, descricao, valor, vencimento, status, data_pagamento, clientes(nome)").order("vencimento"),
      ]);
      return {
        clientes: clientes.data ?? [],
        cobrancas: (cobrancas.data ?? []) as any[],
      };
    },
  });

  const clientes = data?.clientes ?? [];
  const cobrancas = data?.cobrancas ?? [];
  const today = todayISO();
  const thisMonth = today.slice(0, 7);

  const ativos = clientes.filter((c: any) => c.ativo).length;
  const aReceber = cobrancas.filter((c) => c.status === "pendente").reduce((s, c) => s + Number(c.valor), 0);
  const emAtraso = cobrancas.filter((c) => effectiveStatus(c.vencimento, c.status) === "atrasado").reduce((s, c) => s + Number(c.valor), 0);
  const recebidoMes = cobrancas
    .filter((c) => c.status === "pago" && (c.data_pagamento ?? "").startsWith(thisMonth))
    .reduce((s, c) => s + Number(c.valor), 0);

  const atrasadas = cobrancas.filter((c) => effectiveStatus(c.vencimento, c.status) === "atrasado");
  const vencemHoje = cobrancas.filter((c) => c.status === "pendente" && c.vencimento === today);
  const vencem3dias = cobrancas.filter((c) => {
    if (c.status !== "pendente") return false;
    const d = new Date(c.vencimento + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime();
    const dias = Math.floor(d / 86400000);
    return dias > 0 && dias <= 3;
  });

  // Uma linha por cliente, com o próximo vencimento em aberto
  const porCliente = new Map<
    string,
    { id: string; nome: string; prox: string; proxValor: number; count: number; total: number }
  >();
  cobrancas
    .filter((c) => c.status === "pendente")
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
    .slice(0, 6);

  return (
    <AppLayout>
      <div className="p-8 max-w-[1400px]">
        <PageHeader title="Dashboard" subtitle="Visão geral do seu sistema de cobranças" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Clientes Ativos" value={ativos.toString()} icon={Users} tone="info" />
          <StatCard label="A Receber" value={brl(aReceber)} icon={DollarSign} tone="warning" />
          <StatCard label="Em Atraso" value={brl(emAtraso)} icon={AlertTriangle} tone="destructive" />
          <StatCard label="Recebido (Mês)" value={brl(recebidoMes)} icon={CheckCircle2} tone="success" />
        </div>

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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Próximas Cobranças</CardTitle>
            <Link to="/cobrancas" className="text-sm text-primary hover:underline">Ver todas →</Link>
          </CardHeader>
          <CardContent>
            {proximas.length === 0 ? (
              <div className="text-center py-10">
                <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Nenhuma cobrança cadastrada</p>
                <Link to="/clientes"><Button className="mt-4">Cadastrar Cliente</Button></Link>
              </div>
            ) : (
              <div className="divide-y">
                {proximas.map((g) => (
                  <div key={g.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="font-medium">{g.nome}</div>
                      <div className="text-sm text-muted-foreground">
                        Próximo vencimento em {fmtDate(g.prox)}
                        {g.count > 1 && ` · ${g.count} cobranças em aberto`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{brl(g.total)}</div>
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
      </div>
    </AppLayout>
  );
}

function StatCard({ label, value, icon: Icon, tone }: any) {
  const toneClass = {
    info: "bg-info/10 text-info",
    warning: "bg-warning/15 text-warning-foreground",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/15 text-success",
  }[tone as string];
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wide">{label}</div>
            <div className="text-2xl font-bold mt-2">{value}</div>
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
