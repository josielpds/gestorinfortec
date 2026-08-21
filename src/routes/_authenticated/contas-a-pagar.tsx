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
import { MonthFilter } from "@/components/MonthFilter";
import { Plus, Trash2, CheckCircle2, RotateCcw, AlertTriangle, Wallet, CalendarClock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { brl, fmtDate, todayISO } from "@/lib/format";
import { currentUserId } from "@/hooks/useCurrentUser";

export const Route = createFileRoute("/_authenticated/contas-a-pagar")({
  head: () => ({ meta: [
    { title: "Contas a Pagar — CobraZap" },
    { name: "description", content: "Cadastre e controle as contas a pagar do seu negócio, com vencimentos e baixa automática nas saídas." },
    { property: "og:title", content: "Contas a Pagar — CobraZap" },
    { property: "og:description", content: "Controle vencimentos, fornecedores e pagamentos das suas despesas." },
  ] }),
  component: ContasPagarPage,
});

type Conta = {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: number;
  vencimento: string;
  status: "pendente" | "pago" | "cancelado";
  pago_em: string | null;
  categoria: string | null;
  observacoes: string | null;
};

const hoje = () => todayISO();

function ContasPagarPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Conta | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "pendente" | "atrasado" | "pago">("todos");
  const [mesFilter, setMesFilter] = useState<string>(hoje().slice(0, 7));

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_pagar"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_pagar").select("*").order("vencimento");
      if (error) throw error;
      return data as unknown as Conta[];
    },
  });

  const { data: cats = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: async () => (await supabase.from("categorias").select("*").order("nome")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async (p: any) => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("contas_pagar").insert({ ...p, user_id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Conta cadastrada"); qc.invalidateQueries(); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const { error } = await supabase.from("contas_pagar").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta atualizada");
      qc.invalidateQueries();
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Conta["status"] }) => {
      const { error } = await supabase
        .from("contas_pagar")
        .update({ status, pago_em: status === "pago" ? hoje() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Atualizado"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contas_pagar").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removida"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const atrasada = (c: Conta) => c.status === "pendente" && c.vencimento < hoje();
  const mes = hoje().slice(0, 7);

  const matchesMes = (c: Conta) => {
    if (mesFilter === "todos") return true;
    const ref = c.status === "pago" ? (c.pago_em ?? "") : c.vencimento;
    return (ref ?? "").slice(0, 7) === mesFilter;
  };

  const aPagar = contas.filter((c) => c.status === "pendente" && matchesMes(c)).reduce((s, c) => s + Number(c.valor), 0);
  const emAtraso = contas.filter(atrasada).reduce((s, c) => s + Number(c.valor), 0);
  const pagoMes = contas
    .filter((c) => c.status === "pago" && matchesMes(c))
    .reduce((s, c) => s + Number(c.valor), 0);

  const filtered = contas.filter((c) => {
    const statusOk =
      filtro === "todos" ? true
        : filtro === "atrasado" ? atrasada(c)
        : c.status === filtro;
    return statusOk && matchesMes(c);
  });

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
        <PageHeader
          title="Contas a Pagar"
          subtitle="Controle vencimentos e fornecedores. Ao dar baixa, a saída é lançada automaticamente."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <MonthFilter selectedMonth={mesFilter} onChange={setMesFilter} allowAll />
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" /> Nova conta</Button>
                </DialogTrigger>
                <ContaForm categorias={cats as any} onSubmit={(p) => create.mutate(p)} loading={create.isPending} />
              </Dialog>
            </div>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <SummaryCard label="Total a pagar" value={brl(aPagar)} tone="muted" icon={CalendarClock} />
          <SummaryCard label="Em atraso" value={brl(emAtraso)} tone="destructive" icon={AlertTriangle} />
          <SummaryCard label="Pago no mês" value={brl(pagoMes)} tone="success" icon={Wallet} />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {(["todos", "pendente", "atrasado", "pago"] as const).map((s) => (
            <Button key={s} size="sm" variant={filtro === s ? "default" : "outline"} onClick={() => setFiltro(s)}>
              {s === "todos" ? "Todas" : s === "pendente" ? "Pendentes" : s === "atrasado" ? "Atrasadas" : "Pagas"}
            </Button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">Nenhuma conta a pagar registrada</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Vencimento</th>
                    <th className="text-left px-4 py-3">Descrição</th>
                    <th className="text-left px-4 py-3">Fornecedor</th>
                    <th className="text-left px-4 py-3">Categoria</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Valor</th>
                    <th className="text-right px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">{fmtDate(c.vencimento)}</td>
                      <td className="px-4 py-3">{c.descricao}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.fornecedor || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.categoria ?? "—"}</td>
                      <td className="px-4 py-3">
                        {c.status === "pago" ? (
                          <Badge variant="outline" className="bg-success/15 text-success border-success/30">Pago</Badge>
                        ) : atrasada(c) ? (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Atrasada</Badge>
                        ) : c.status === "cancelado" ? (
                          <Badge variant="outline">Cancelada</Badge>
                        ) : (
                          <Badge variant="outline">Pendente</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{brl(c.valor)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" title="Editar" onClick={() => setEditing(c)}>
                          <Pencil className="h-4 w-4 text-primary" />
                        </Button>
                        {c.status === "pago" ? (
                          <Button size="sm" variant="ghost" title="Reabrir" onClick={() => setStatus.mutate({ id: c.id, status: "pendente" })}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" title="Dar baixa (marcar como pago)" onClick={() => setStatus.mutate({ id: c.id, status: "pago" })}>
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" title="Excluir" onClick={() => { if (confirm("Excluir conta?")) remove.mutate(c.id); }}>
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <ContaForm
            categorias={cats as any}
            initial={editing}
            onSubmit={(p) => update.mutate({ id: editing.id, payload: p })}
            loading={update.isPending}
            submitLabel="Salvar alterações"
          />
        )}
      </Dialog>
    </AppLayout>
  );
}

function ContaForm({
  categorias,
  onSubmit,
  loading,
  initial,
  submitLabel = "Cadastrar",
}: {
  categorias: any[];
  onSubmit: (p: any) => void;
  loading: boolean;
  initial?: Conta;
  submitLabel?: string;
}) {
  const [form, setForm] = useState({
    descricao: initial?.descricao ?? "",
    fornecedor: initial?.fornecedor ?? "",
    valor: initial ? String(initial.valor) : "",
    vencimento: initial?.vencimento ?? todayISO(),
    categoria: initial?.categoria ?? "",
    observacoes: initial?.observacoes ?? "",
  });
  const catsSaida = categorias.filter((c) => c.tipo === "saida");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{initial ? "Editar conta a pagar" : "Nova conta a pagar"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div><Label>Descrição *</Label><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} maxLength={200} /></div>
        <div><Label>Fornecedor</Label><Input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} maxLength={120} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} /></div>
          <div><Label>Vencimento *</Label><Input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} /></div>
        </div>
        <div>
          <Label>Categoria</Label>
          <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
            <SelectContent>
              {catsSaida.map((c: any) => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Observações</Label><Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} maxLength={500} /></div>
      </div>
      <DialogFooter>
        <Button
          disabled={loading || !form.descricao || !form.valor}
          onClick={() => onSubmit({
            descricao: form.descricao,
            fornecedor: form.fornecedor || null,
            valor: parseFloat(form.valor),
            vencimento: form.vencimento,
            categoria: form.categoria || null,
            observacoes: form.observacoes || null,
            ...(initial ? {} : { status: "pendente" }),
          })}
        >
          {loading ? "Salvando..." : submitLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SummaryCard({ label, value, tone, icon: Icon }: any) {
  const tc: any = {
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
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
