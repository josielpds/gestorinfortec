import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, MessageCircle, AlertTriangle, Clock, Calendar, AlertCircle } from "lucide-react";
import { brl, fmtDate, effectiveStatus, todayISO, daysBetween } from "@/lib/format";
import { waLink, renderTemplate } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/mensagens")({
  head: () => ({ meta: [{ title: "Disparar Mensagens — CobraZap" }, { name: "description", content: "Envie cobranças e lembretes via WhatsApp no vencimento e pós-vencimento (5 e 7 dias)." }] }),
  component: MensagensPage,
});

export function MensagensPage() {
  const { data: cobrancas = [] } = useQuery({
    queryKey: ["cobrancas-msg"],
    queryFn: async () =>
      ((await supabase.from("cobrancas").select("*, clientes(nome, telefone)")
        .neq("status", "pago").neq("status", "cancelado").order("vencimento")).data ?? []) as any[],
  });

  const { data: cfg = {} } = useQuery({
    queryKey: ["cfg-all"],
    queryFn: async () => {
      const { data } = await supabase.from("configuracoes").select("key, value");
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.key] = r.value ?? ""; });
      return map;
    },
  });

  const today = todayISO();

  const cobrancasCalculadas = cobrancas.map((c: any) => {
    const d = daysBetween(c.vencimento, today);
    return { ...c, diasAtraso: d };
  });

  const hoje = cobrancasCalculadas.filter((c) => c.diasAtraso === 0);
  const atraso5 = cobrancasCalculadas.filter((c) => c.diasAtraso >= 5);
  const atraso7 = cobrancasCalculadas.filter((c) => c.diasAtraso >= 7);
  const atrasadas = cobrancasCalculadas.filter((c) => c.diasAtraso > 0 || effectiveStatus(c.vencimento, c.status) === "atrasado");
  const proximas = cobrancasCalculadas.filter((c) => c.diasAtraso < 0 && c.diasAtraso >= -3);

  const tplHoje = cfg.template_cobranca || "Olá {nome}, lembramos que sua cobrança de {valor} ({descricao}) vence hoje ({vencimento}).";
  const tplAtraso5 = cfg.template_atraso_5d || cfg.template_atraso || "Olá {nome}, sua cobrança de {valor} ({descricao}) venceu há 5 dias ({vencimento}). Favor efetuar o pagamento.";
  const tplAtraso7 = cfg.template_atraso_7d || cfg.template_atraso || "Aviso Importante: Olá {nome}, sua cobrança de {valor} ({descricao}) está com 7 dias de atraso ({vencimento}). Entre em contato para regularizar.";
  const tplAtrasoGeral = cfg.template_atraso || "Olá {nome}, constamos em aberto sua cobrança de {valor} ({descricao}) vencida em {vencimento}. Favor regularizar.";
  const tplProximas = cfg.template_lembrete || "Olá {nome}, lembrete preventivo: sua cobrança de {valor} ({descricao}) vencerá em {vencimento}.";

  return (
    <AppLayout>
      <div className="p-8 max-w-[1400px]">
        <PageHeader title="Disparar Mensagens" subtitle="Envie cobranças e lembretes pelo WhatsApp no dia do vencimento, 5 e 7 dias de atraso" />

        <Tabs defaultValue="hoje">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="hoje" className="data-[state=active]:bg-warning data-[state=active]:text-warning-foreground">
              <Clock className="h-4 w-4 mr-2" /> No dia do vencimento ({hoje.length})
            </TabsTrigger>
            <TabsTrigger value="atraso5" className="data-[state=active]:bg-destructive/80 data-[state=active]:text-destructive-foreground">
              <Calendar className="h-4 w-4 mr-2" /> 5 dias após vencimento ({atraso5.length})
            </TabsTrigger>
            <TabsTrigger value="atraso7" className="data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">
              <AlertCircle className="h-4 w-4 mr-2" /> 7 dias após vencimento ({atraso7.length})
            </TabsTrigger>
            <TabsTrigger value="atrasadas" className="text-destructive">
              <AlertTriangle className="h-4 w-4 mr-2" /> Todas Atrasadas ({atrasadas.length})
            </TabsTrigger>
            <TabsTrigger value="proximas">
              <MessageCircle className="h-4 w-4 mr-2" /> Próximas a vencer ({proximas.length})
            </TabsTrigger>
            <TabsTrigger value="livre">Mensagem livre</TabsTrigger>
          </TabsList>

          <TabsContent value="hoje">
            <ListaDispara items={hoje} template={tplHoje} tone="warning" titulo="Lembrete para o Dia do Vencimento" />
          </TabsContent>
          <TabsContent value="atraso5">
            <ListaDispara items={atraso5} template={tplAtraso5} tone="destructive" titulo="Cobranças com 5 ou mais dias de Atraso" />
          </TabsContent>
          <TabsContent value="atraso7">
            <ListaDispara items={atraso7} template={tplAtraso7} tone="destructive" titulo="Cobranças com 7 ou mais dias de Atraso" />
          </TabsContent>
          <TabsContent value="atrasadas">
            <ListaDispara items={atrasadas} template={tplAtrasoGeral} tone="destructive" titulo="Todas as Cobranças Atrasadas" />
          </TabsContent>
          <TabsContent value="proximas">
            <ListaDispara items={proximas} template={tplProximas} tone="info" titulo="Cobranças Próximas do Vencimento (Preventivo)" />
          </TabsContent>
          <TabsContent value="livre">
            <MensagemLivre />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function ListaDispara({ items, template, tone, titulo }: { items: any[]; template: string; tone: string; titulo?: string }) {
  if (items.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="py-10 text-center text-muted-foreground">
          Nenhuma cobrança nesta categoria 🎉
        </CardContent>
      </Card>
    );
  }
  const bg = { destructive: "text-destructive", warning: "text-warning-foreground", info: "text-info" }[tone] ?? "";
  const sendAll = () => {
    items.forEach((c, i) => {
      const msg = renderTemplate(template, { nome: c.clientes?.nome, valor: c.valor, descricao: c.descricao, vencimento: c.vencimento });
      setTimeout(() => window.open(waLink(c.clientes?.telefone ?? "", msg), "_blank"), i * 400);
    });
  };
  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className={bg}>{titulo ?? `${items.length} cobranças`}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Total: {items.length} cliente(s) a contatar</p>
        </div>
        <Button onClick={sendAll}><Send className="h-4 w-4 mr-2" /> Disparar todas pelo WhatsApp</Button>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Cliente</th>
              <th className="text-left px-4 py-3">Descrição</th>
              <th className="text-right px-4 py-3">Valor</th>
              <th className="text-left px-4 py-3">Vencimento</th>
              <th className="text-center px-4 py-3">Atraso</th>
              <th className="text-right px-4 py-3">Enviar</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{c.clientes?.nome}</td>
                <td className="px-4 py-3">{c.descricao}</td>
                <td className="px-4 py-3 text-right font-semibold">{brl(c.valor)}</td>
                <td className="px-4 py-3">{fmtDate(c.vencimento)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-1 rounded font-semibold ${c.diasAtraso > 0 ? "bg-destructive/10 text-destructive" : c.diasAtraso === 0 ? "bg-warning/15 text-warning-foreground" : "bg-info/10 text-info"}`}>
                    {c.diasAtraso > 0 ? `${c.diasAtraso} dia(s)` : c.diasAtraso === 0 ? "Hoje" : `em ${Math.abs(c.diasAtraso)}d`}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" onClick={() => {
                    const msg = renderTemplate(template, { nome: c.clientes?.nome, valor: c.valor, descricao: c.descricao, vencimento: c.vencimento });
                    window.open(waLink(c.clientes?.telefone ?? "", msg), "_blank");
                  }}><Send className="h-4 w-4 mr-1" /> WhatsApp</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function MensagemLivre() {
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-all"],
    queryFn: async () => (await supabase.from("clientes").select("id, nome, telefone").eq("ativo", true).order("nome")).data ?? [],
  });
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const enviar = () => {
    const alvos = clientes.filter((c: any) => sel.includes(c.id));
    alvos.forEach((c: any, i) => {
      const m = msg.replaceAll("{nome}", c.nome);
      setTimeout(() => window.open(waLink(c.telefone, m), "_blank"), i * 400);
    });
  };
  return (
    <Card className="mt-4">
      <CardHeader><CardTitle>Mensagem personalizada</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Mensagem (use {"{nome}"} para personalizar)</Label>
          <Textarea rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Olá {nome}, ..." />
        </div>
        <div>
          <Label>Clientes ({sel.length} selecionados)</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 max-h-80 overflow-y-auto border rounded p-3">
            {clientes.map((c: any) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sel.includes(c.id)} onChange={() => toggle(c.id)} />
                {c.nome}
              </label>
            ))}
          </div>
        </div>
        <Button disabled={!msg || sel.length === 0} onClick={enviar}><Send className="h-4 w-4 mr-2" /> Disparar para {sel.length} contato(s)</Button>
      </CardContent>
    </Card>
  );
}
