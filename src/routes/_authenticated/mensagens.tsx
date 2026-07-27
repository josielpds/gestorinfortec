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
import { Send, MessageCircle, AlertTriangle, Clock } from "lucide-react";
import { brl, fmtDate, effectiveStatus, todayISO } from "@/lib/format";
import { waLink, renderTemplate } from "@/lib/whatsapp";

export const Route = createFileRoute("/mensagens")({
  head: () => ({ meta: [{ title: "Disparar Mensagens — CobraZap" }, { name: "description", content: "Envie cobranças e lembretes via WhatsApp." }] }),
  component: MensagensPage,
});

function MensagensPage() {
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
  const atrasadas = cobrancas.filter((c) => effectiveStatus(c.vencimento, c.status) === "atrasado");
  const hoje = cobrancas.filter((c) => c.vencimento === today);
  const proximas = cobrancas.filter((c) => {
    const d = Math.floor((new Date(c.vencimento + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000);
    return d > 0 && d <= 3;
  });

  return (
    <AppLayout>
      <div className="p-8 max-w-[1400px]">
        <PageHeader title="Disparar Mensagens" subtitle="Envie cobranças e lembretes pelo WhatsApp em um clique" />

        <Tabs defaultValue="atrasadas">
          <TabsList>
            <TabsTrigger value="atrasadas"><AlertTriangle className="h-4 w-4 mr-2" /> Atrasadas ({atrasadas.length})</TabsTrigger>
            <TabsTrigger value="hoje"><Clock className="h-4 w-4 mr-2" /> Vencem hoje ({hoje.length})</TabsTrigger>
            <TabsTrigger value="proximas"><MessageCircle className="h-4 w-4 mr-2" /> Próximas ({proximas.length})</TabsTrigger>
            <TabsTrigger value="livre">Mensagem livre</TabsTrigger>
          </TabsList>

          <TabsContent value="atrasadas"><ListaDispara items={atrasadas} template={cfg.template_atraso ?? ""} tone="destructive" /></TabsContent>
          <TabsContent value="hoje"><ListaDispara items={hoje} template={cfg.template_cobranca ?? ""} tone="warning" /></TabsContent>
          <TabsContent value="proximas"><ListaDispara items={proximas} template={cfg.template_lembrete ?? ""} tone="info" /></TabsContent>
          <TabsContent value="livre"><MensagemLivre /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function ListaDispara({ items, template, tone }: { items: any[]; template: string; tone: string }) {
  if (items.length === 0) {
    return <Card className="mt-4"><CardContent className="py-10 text-center text-muted-foreground">Nenhuma cobrança nesta categoria 🎉</CardContent></Card>;
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
        <CardTitle className={bg}>{items.length} cobranças</CardTitle>
        <Button onClick={sendAll}><Send className="h-4 w-4 mr-2" /> Disparar todas</Button>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="text-left px-4 py-3">Cliente</th><th className="text-left px-4 py-3">Descrição</th><th className="text-right px-4 py-3">Valor</th><th className="text-left px-4 py-3">Vencimento</th><th className="text-right px-4 py-3">Enviar</th></tr>
          </thead>
          <tbody className="divide-y">
            {items.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{c.clientes?.nome}</td>
                <td className="px-4 py-3">{c.descricao}</td>
                <td className="px-4 py-3 text-right font-semibold">{brl(c.valor)}</td>
                <td className="px-4 py-3">{fmtDate(c.vencimento)}</td>
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
