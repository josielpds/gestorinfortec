import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { brl, fmtDate, todayISO } from "@/lib/format";
import { currentUserId } from "@/hooks/useCurrentUser";
import { monthsPT } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/movimentacoes")({
  head: () => ({ meta: [
    { title: "Lançamentos de Entradas e Saídas — CobraZap" },
    { name: "description", content: "Lance entradas e despesas manualmente e acompanhe seu saldo." },
  ] }),
  component: MovimentacoesPage,
});

type Mov = {
  id: string; tipo: "entrada" | "saida"; valor: number; descricao: string;
  categoria: string | null; data: string; cliente_id: string | null; cobranca_id: string | null;
  status: "pago" | "pendente"; conta_pagar_id: string | null;
  clientes?: { nome: string } | null;
};

function MovimentacoesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"todos" | "entrada" | "saida">("todos");
  const [mesFilter, setMesFilter] = useState<"todos" | string | null>(null);

  const { data: movs = [] } = useQuery({
    queryKey: ["movimentacoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("movimentacoes")
        .select("*, clientes(nome)").order("data", { ascending: false });
      if (error) throw error;
      return data as unknown as Mov[];
    },
  });

  const { data: cats = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: async () => (await supabase.from("categorias").select("*").order("nome")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async (p: any) => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("movimentacoes").insert({ ...p, user_id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Movimentação lançada"); qc.invalidateQueries(); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (m: Mov) => {
      if (m.cobranca_id) throw new Error("Esta entrada foi gerada por uma cobrança paga. Exclua ou reabra a cobrança.");
      const { error } = await supabase.from("movimentacoes").delete().eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async (m: Mov) => {
      const novo = m.status === "pago" ? "pendente" : "pago";
      const { error } = await supabase.from("movimentacoes").update({ status: novo }).eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Situação atualizada"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = movs.filter((m) => {
      const mesMatch = mesFilter === "todos" || !mesFilter
        ? true
        : m.data.slice(0, 7) === mesFilter;
      return filter === "todos" ? true : m.tipo === filter && mesMatch;
    });
  const entradas = movs
    .filter((m) => m.tipo === "entrada" && m.status === "pago" && (mesFilter === "todos" || !mesFilter || m.data.slice(0, 7) === mesFilter))
    .reduce((s, m) => s + Number(m.valor), 0);
  const saidas = movs
    .filter((m) => m.tipo === "saida" && m.status === "pago" && (mesFilter === "todos" || !mesFilter || m.data.slice(0, 7) === mesFilter))
    .reduce((s, m) => s + Number(m.valor), 0);
  const pendenteReceber = movs
    .filter((m) => m.tipo === "entrada" && m.status === "pendente" && (mesFilter === "todos" || !mesFilter || m.data.slice(0, 7) === mesFilter))
    .reduce((s, m) => s + Number(m.valor), 0);
  const pendentePagar = movs
    .filter((m) => m.tipo === "saida" && m.status === "pendente" && (mesFilter === "todos" || !mesFilter || m.data.slice(0, 7) === mesFilter))
    .reduce((s, m) => s + Number(m.valor), 0);

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
        <PageHeader
          title="Lançamentos de Entradas e Saídas"
          subtitle="Lance entradas e despesas manuais. Contas recebidas e pagas viram lançamentos automaticamente."
          action={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Novo lançamento</Button></DialogTrigger>
              <MovForm categorias={cats as any} onSubmit={(p) => create.mutate(p)} loading={create.isPending} />
            </Dialog>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <SummaryCard label="Entradas recebidas" value={brl(entradas)} tone="success" icon={TrendingUp} />
          <SummaryCard label="Saídas pagas" value={brl(saidas)} tone="destructive" icon={TrendingDown} />
          <SummaryCard label="Pendente a receber" value={brl(pendenteReceber)} tone="info" icon={TrendingUp} />
          <SummaryCard label="Pendente a pagar" value={brl(pendentePagar)} tone="warning" icon={TrendingDown} />
          <SummaryCard label="Saldo realizado" value={brl(entradas - saidas)} tone={entradas - saidas >= 0 ? "success" : "destructive"} icon={TrendingUp} />
        </div>

        <div className="flex gap-2 mb-4">
          {(["todos", "entrada", "saida"] as const).map((s) => (
            <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
              {s === "todos" ? "Todos" : s === "entrada" ? "Entradas" : "Saídas"}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => setMesFilter(null)}>Mês</Button>
        </div>

        <div className="flex gap-2 mb-4 hidden sm:block" id="mes-filter">
          {(monthsPT as const).map((m) => (
            <Button
              key={m}
              variant={mesFilter === m ? "default" : "outline"}
              size="sm"
              onClick={() => setMesFilter(m)}
            >
              {m}
            </Button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">Nenhuma movimentação registrada</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Data</th>
                    <th className="text-left px-4 py-3">Tipo</th>
                    <th className="text-left px-4 py-3">Descrição</th>
                    <th className="text-left px-4 py-3">Categoria</th>
                    <th className="text-left px-4 py-3">Situação</th>
                    <th className="text-right px-4 py-3">Valor</th>
                    <th className="text-right px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">{fmtDate(m.data)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={m.tipo === "entrada" ? "bg-success/15 text-success border-success/30" : "bg-destructive/10 text-destructive border-destructive/30"}>
                          {m.tipo === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{m.descricao}{m.clientes?.nome ? <span className="text-muted-foreground"> · {m.clientes.nome}</span> : null}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.categoria ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          title={m.cobranca_id || m.conta_pagar_id ? "Vinculado a cobrança/conta" : "Clique para alternar pago/pendente"}
                          onClick={() => {
                            if (m.cobranca_id || m.conta_pagar_id) return;
                            toggleStatus.mutate(m);
                          }}
                          className="h-auto p-0"
                        >
                          <StatusBadge status={m.status} />
                        </Button>
                      </td>
                      <td className={"px-4 py-3 text-right font-semibold " + (m.tipo === "entrada" ? "text-success" : "text-destructive")}>
                        {m.tipo === "entrada" ? "+" : "-"} {brl(m.valor)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" title={m.cobranca_id ? "Vinculado a cobrança" : "Excluir"} onClick={() => { if (confirm("Excluir lançamento?")) remove.mutate(m); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function MovForm({ categorias, onSubmit, loading }: { categorias: any[]; onSubmit: (p: any) => void; loading: boolean }) {
  const [form, setForm] = useState({ tipo: "saida" as "entrada" | "saida", status: "pago" as "pago" | "pendente", valor: "", descricao: "", categoria: "", data: todayISO(), observacoes: "" });
  const catsFiltradas = categorias.filter((c) => c.tipo === form.tipo);
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Novo lançamento</DialogTitle></DialogHeader>
      <div className="grid gap-4 py-2">
        <div>
          <Label>Tipo *</Label>
          <Select value={form.tipo} onValueChange={(v: "entrada" | "saida") => setForm({ ...form, tipo: v, categoria: "" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída (despesa)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Descrição *</Label><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} maxLength={200} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} /></div>
          <div><Label>Data *</Label><Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
        </div>
        <div>
          <Label>Categoria</Label>
          <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
            <SelectContent>
              {catsFiltradas.map((c: any) => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Situação *</Label>
          <Select value={form.status} onValueChange={(v: "pago" | "pendente") => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Observações</Label><Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} maxLength={500} /></div>
      </div>
      <DialogFooter>
        <Button disabled={loading || !form.descricao || !form.valor}
          onClick={() => onSubmit({
            tipo: form.tipo,
            status: form.status,
            valor: parseFloat(form.valor),
            descricao: form.descricao,
            data: form.data,
            categoria: form.categoria || null,
          })}>
          {loading ? "Salvando..." : "Lançar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function StatusBadge({ status }: { status: "pago" | "pendente" }) {
  return (
    <Badge variant="outline" className={
      status === "pago"
        ? "bg-success/15 text-success border-success/30"
        : "bg-warning/15 text-warning-foreground border-warning/30"
    }>
      {status === "pago" ? "Pago" : "Pendente"}
    </Badge>
  );
}

function SummaryCard({ label, value, tone, icon: Icon }: any) {
  const tc: any = {
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
    info: "text-info bg-info/10",
    warning: "text-warning-foreground bg-warning/15",
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
