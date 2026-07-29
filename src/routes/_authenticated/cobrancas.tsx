import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Plus, Trash2, Check, Send, Repeat } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { brl, fmtDate, effectiveStatus, todayISO } from "@/lib/format";
import { waLink, renderTemplate } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/cobrancas")({
  head: () => ({ meta: [{ title: "Cobranças — CobraZap" }, { name: "description", content: "Cadastro e gestão de cobranças." }] }),
  component: CobrancasPage,
});

type Cobranca = {
  id: string; cliente_id: string; descricao: string; valor: number;
  vencimento: string; status: string; data_pagamento: string | null;
  recorrente?: boolean; frequencia?: string | null; categoria_id?: string | null;
  clientes?: { nome: string; telefone: string };
  categorias?: { nome: string } | null;
};

const FREQ_LABEL: Record<string, string> = {
  semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal", bimestral: "Bimestral",
  trimestral: "Trimestral", semestral: "Semestral", anual: "Anual",
};

function CobrancasPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("todos");

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

  const filtered = cobrancas.filter((c) => {
    if (filter === "todos") return true;
    if (filter === "recorrente") return !!c.recorrente;
    return effectiveStatus(c.vencimento, c.status) === filter;
  });

  return (
    <AppLayout>
      <div className="p-8 max-w-[1400px]">
        <PageHeader
          title="Cobranças"
          subtitle="Gerencie as cobranças dos seus clientes"
          action={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button disabled={clientes.length === 0}><Plus className="h-4 w-4 mr-2" /> Nova Cobrança</Button></DialogTrigger>
              <CobrancaForm clientes={clientes as any} categorias={categorias as any} onSubmit={(p) => create.mutate(p)} loading={create.isPending} />
            </Dialog>
          }
        />

        <div className="flex flex-wrap gap-2 mb-4">
          {["todos", "pendente", "atrasado", "pago", "cancelado", "recorrente"].map((s) => (
            <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
              {s === "todos" ? "Todas" : s === "recorrente" ? "Mensalidades" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>


        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                {clientes.length === 0 ? "Cadastre um cliente antes de criar cobranças" : "Nenhuma cobrança encontrada"}
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
                  {filtered.map((c) => {
                    const st = effectiveStatus(c.vencimento, c.status);
                    return (
                      <tr key={c.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{c.clientes?.nome ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {c.descricao}
                            {c.recorrente && (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1">
                                <Repeat className="h-3 w-3" /> {FREQ_LABEL[c.frequencia ?? ""] ?? "Recorrente"}
                              </Badge>
                            )}
                          </div>
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
                              <Button size="sm" variant="ghost" title="Marcar como pago" onClick={() => marcarPago.mutate(c.id)}>
                                <Check className="h-4 w-4 text-success" />
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir?")) remove.mutate(c.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
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

function CobrancaForm({ clientes, categorias, onSubmit, loading }: { clientes: any[]; categorias: any[]; onSubmit: (p: any) => void; loading: boolean }) {
  const [form, setForm] = useState({
    cliente_id: "", descricao: "", valor: "", vencimento: todayISO(), observacoes: "",
    categoria_id: "", recorrente: false, frequencia: "mensal", recorrencia_fim: "",
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nova Cobrança</DialogTitle></DialogHeader>
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
                <Label>Repetir até (opcional)</Label>
                <Input type="date" value={form.recorrencia_fim} onChange={(e) => setForm({ ...form, recorrencia_fim: e.target.value })} />
              </div>
            </div>
          )}
        </div>

        <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} /></div>
      </div>
      <DialogFooter>
        <Button disabled={loading || !form.cliente_id || !form.descricao || !form.valor}
          onClick={() => onSubmit({
            cliente_id: form.cliente_id,
            descricao: form.descricao,
            observacoes: form.observacoes,
            vencimento: form.vencimento,
            valor: parseFloat(form.valor),
            categoria_id: form.categoria_id || null,
            recorrente: form.recorrente,
            frequencia: form.recorrente ? form.frequencia : null,
            recorrencia_fim: form.recorrente && form.recorrencia_fim ? form.recorrencia_fim : null,
          })}>
          {loading ? "Salvando..." : "Criar cobrança"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

