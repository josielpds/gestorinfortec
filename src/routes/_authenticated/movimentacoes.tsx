import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Plus, Trash2, TrendingUp, TrendingDown, Pencil, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { toast } from "sonner";
import { brl, fmtDate, todayISO } from "@/lib/format";
import { currentUserId } from "@/hooks/useCurrentUser";

export const Route = createFileRoute("/_authenticated/movimentacoes")({
  head: () => ({
    meta: [
      { title: "Lançamentos de Entradas e Saídas — CobraZap" },
      { name: "description", content: "Lance entradas e despesas manualmente e acompanhe seu saldo." },
    ],
  }),
  component: MovimentacoesPage,
});

type Mov = {
  id: string;
  tipo: "entrada" | "saida";
  valor: number;
  descricao: string;
  categoria: string | null;
  data: string;
  cliente_id: string | null;
  cobranca_id: string | null;
  status: "pago" | "pendente";
  conta_pagar_id: string | null;
  observacoes: string | null;
  clientes?: { nome: string } | null;
};

function MovimentacoesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Mov | null>(null);
  const [filter, setFilter] = useState<"todos" | "entrada" | "saida">("todos");
  const [mesFilter, setMesFilter] = useState<string>(todayISO().slice(0, 7));

  const { data: movs = [] } = useQuery({
    queryKey: ["movimentacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes")
        .select("*, clientes(nome)")
        .order("data", { ascending: false });
      if (error) throw error;
      return data as unknown as Mov[];
    },
  });

  const { data: cats = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: async () => (await supabase.from("categorias").select("*").order("nome")).data ?? [],
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => (await supabase.from("clientes").select("id, nome").order("nome")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async (p: any) => {
      const user_id = await currentUserId();
      const payload: any = {
        user_id,
        tipo: p.tipo,
        status: p.status || "pago",
        valor: p.valor,
        descricao: p.descricao,
        data: p.data || todayISO(),
        categoria: p.categoria || null,
        cliente_id: p.cliente_id || null,
        observacoes: p.observacoes || null,
      };
      const { error } = await supabase.from("movimentacoes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento adicionado com sucesso!");
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["relatorios"] });
      setOpen(false);
    },
    onError: (e: any) => {
      console.error("Erro ao incluir lançamento:", e);
      toast.error(e.message || "Não foi possível incluir o lançamento.");
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const { error } = await supabase.from("movimentacoes").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["relatorios"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar lançamento"),
  });

  const remove = useMutation({
    mutationFn: async (m: Mov) => {
      if (m.cobranca_id) throw new Error("Esta entrada foi gerada por uma cobrança paga. Exclua ou reabra a cobrança.");
      const { error } = await supabase.from("movimentacoes").delete().eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["relatorios"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async (m: Mov) => {
      const novo = m.status === "pago" ? "pendente" : "pago";
      const { error } = await supabase
        .from("movimentacoes")
        .update({ status: novo })
        .eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Situação atualizada");
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["relatorios"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const mesMatch = (m: Mov) => mesFilter === "todos" || (m.data ?? "").slice(0, 7) === mesFilter;

  const filtered = useMemo(
    () => movs.filter((m) => filter === "todos" ? mesMatch(m) : m.tipo === filter && mesMatch(m)),
    [movs, filter, mesFilter],
  );

  const entradas = movs
    .filter((m) => m.tipo === "entrada" && m.status === "pago" && mesMatch(m))
    .reduce((s, m) => s + Number(m.valor), 0);
  const saidas = movs
    .filter((m) => m.tipo === "saida" && m.status === "pago" && mesMatch(m))
    .reduce((s, m) => s + Number(m.valor), 0);
  const pendenteReceber = movs
    .filter((m) => m.tipo === "entrada" && m.status === "pendente" && mesMatch(m))
    .reduce((s, m) => s + Number(m.valor), 0);
  const pendentePagar = movs
    .filter((m) => m.tipo === "saida" && m.status === "pendente" && mesMatch(m))
    .reduce((s, m) => s + Number(m.valor), 0);

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
        <PageHeader
          title="Lançamentos de Entradas e Saídas"
          subtitle="Lance entradas e despesas manuais. Contas recebidas e pagas viram lançamentos automaticamente."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <MonthFilter selectedMonth={mesFilter} onChange={setMesFilter} allowAll />
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" /> Novo lançamento
                  </Button>
                </DialogTrigger>
                {open && (
                  <MovForm
                    categorias={cats as any}
                    clientes={clientes as any}
                    onSubmit={(p) => create.mutate(p)}
                    loading={create.isPending}
                  />
                )}
              </Dialog>
            </div>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <SummaryCard label="Entradas recebidas" value={brl(entradas)} tone="success" icon={TrendingUp} />
          <SummaryCard label="Saídas pagas" value={brl(saidas)} tone="destructive" icon={TrendingDown} />
          <SummaryCard label="Pendente a receber" value={brl(pendenteReceber)} tone="info" icon={TrendingUp} />
          <SummaryCard label="Pendente a pagar" value={brl(pendentePagar)} tone="warning" icon={TrendingDown} />
          <SummaryCard
            label="Saldo realizado"
            value={brl(entradas - saidas)}
            tone={entradas - saidas >= 0 ? "success" : "destructive"}
            icon={TrendingUp}
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {(["todos", "entrada", "saida"] as const).map((s) => (
            <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
              {s === "todos" ? "Todos" : s === "entrada" ? "Entradas" : "Saídas"}
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
                          <Badge
                            variant="outline"
                            className={
                              m.tipo === "entrada"
                                ? "bg-success/15 text-success border-success/30"
                                : "bg-destructive/10 text-destructive border-destructive/30"
                            }
                          >
                            {m.tipo === "entrada" ? "Entrada" : "Saída"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {m.descricao}
                          {m.clientes?.nome ? <span className="text-muted-foreground"> · {m.clientes.nome}</span> : null}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{m.categoria ?? "—"}</td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            title={
                              m.cobranca_id || m.conta_pagar_id
                                ? "Vinculado a cobrança/conta"
                                : "Clique para alternar pago/pendente"
                            }
                            onClick={() => {
                              if (m.cobranca_id || m.conta_pagar_id) return;
                              toggleStatus.mutate(m);
                            }}
                            className="h-auto p-0 hover:bg-transparent"
                          >
                            <StatusBadge status={m.status} />
                          </Button>
                        </td>
                        <td
                          className={
                            "px-4 py-3 text-right font-semibold " +
                            (m.tipo === "entrada" ? "text-success" : "text-destructive")
                          }
                        >
                          {m.tipo === "entrada" ? "+" : "-"} {brl(m.valor)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Editar"
                            onClick={() => setEditing(m)}
                            disabled={!!m.cobranca_id || !!m.conta_pagar_id}
                          >
                            <Pencil
                              className={
                                "h-4 w-4 " +
                                (m.cobranca_id || m.conta_pagar_id ? "text-muted-foreground" : "text-primary")
                              }
                            />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={m.cobranca_id ? "Vinculado a cobrança" : "Excluir"}
                            onClick={() => {
                              if (confirm("Excluir lançamento?")) remove.mutate(m);
                            }}
                            disabled={!!m.cobranca_id}
                          >
                            <Trash2
                              className={"h-4 w-4 " + (m.cobranca_id ? "text-muted-foreground" : "text-destructive")}
                            />
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
          <MovForm
            categorias={cats as any}
            clientes={clientes as any}
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

function MovForm({
  categorias,
  clientes = [],
  onSubmit,
  loading,
  initial,
  submitLabel = "Lançar",
}: {
  categorias: any[];
  clientes?: any[];
  onSubmit: (p: any) => void;
  loading: boolean;
  initial?: Mov;
  submitLabel?: string;
}) {
  const [tipo, setTipo] = useState<"entrada" | "saida">(initial?.tipo ?? "entrada");
  const [status, setStatus] = useState<"pago" | "pendente">(initial?.status ?? "pago");
  const [valor, setValor] = useState(initial ? String(initial.valor) : "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [categoria, setCategoria] = useState(initial?.categoria ?? "");
  const [clienteId, setClienteId] = useState(initial?.cliente_id ?? "");
  const [data, setData] = useState(initial?.data ?? todayISO());
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? "");

  const catsFiltradas = useMemo(
    () => categorias.filter((c) => !c.tipo || c.tipo.toLowerCase() === tipo.toLowerCase()),
    [categorias, tipo],
  );

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanValor = valor.toString().replace(",", ".");
    const parsedValor = parseFloat(cleanValor);

    if (!descricao.trim()) {
      toast.error("Por favor, informe a descrição do lançamento.");
      return;
    }

    if (isNaN(parsedValor) || parsedValor <= 0) {
      toast.error("Por favor, informe um valor válido maior que zero.");
      return;
    }

    onSubmit({
      tipo,
      status,
      valor: parsedValor,
      descricao: descricao.trim(),
      data: data || todayISO(),
      categoria: categoria || null,
      cliente_id: tipo === "entrada" && clienteId ? clienteId : null,
      observacoes: observacoes.trim() || null,
    });
  };

  return (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{initial ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        <div>
          <Label className="text-xs font-semibold uppercase text-muted-foreground">Tipo de Movimentação</Label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            <Button
              type="button"
              variant={tipo === "entrada" ? "default" : "outline"}
              className={
                tipo === "entrada"
                  ? "bg-success text-success-foreground hover:bg-success/90 justify-center"
                  : "justify-center border-dashed"
              }
              onClick={() => {
                setTipo("entrada");
                setCategoria("");
              }}
            >
              <ArrowUpCircle className="h-4 w-4 mr-2" />
              Entrada (Receita)
            </Button>
            <Button
              type="button"
              variant={tipo === "saida" ? "default" : "outline"}
              className={
                tipo === "saida"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 justify-center"
                  : "justify-center border-dashed"
              }
              onClick={() => {
                setTipo("saida");
                setCategoria("");
                setClienteId("");
              }}
            >
              <ArrowDownCircle className="h-4 w-4 mr-2" />
              Saída (Despesa)
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="mov-desc">Descrição *</Label>
          <Input
            id="mov-desc"
            placeholder={tipo === "entrada" ? "Ex: Venda de serviço, Consultoria..." : "Ex: Conta de luz, Fornecedor..."}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={200}
            required
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="mov-valor">Valor (R$) *</Label>
            <Input
              id="mov-valor"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="mov-data">Data *</Label>
            <Input
              id="mov-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {catsFiltradas.length === 0 ? (
                  <SelectItem value="geral" disabled>Nenhuma categoria</SelectItem>
                ) : (
                  catsFiltradas.map((c: any) => (
                    <SelectItem key={c.id || c.nome} value={c.nome}>
                      {c.nome}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Situação *</Label>
            <Select value={status} onValueChange={(v: "pago" | "pendente") => setStatus(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pago">Pago / Realizado</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {tipo === "entrada" && clientes.length > 0 && (
          <div>
            <Label>Cliente vinculado (opcional)</Label>
            <Select value={clienteId || "nenhum"} onValueChange={(v) => setClienteId(v === "nenhum" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhum cliente vinculado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Nenhum cliente</SelectItem>
                {clientes.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="mov-obs">Observações (opcional)</Label>
          <Textarea
            id="mov-obs"
            rows={2}
            placeholder="Detalhes ou anotações adicionais..."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            maxLength={500}
          />
        </div>

        <DialogFooter className="pt-2">
          <Button type="submit" disabled={loading || !descricao.trim() || !valor.trim()}>
            {loading ? "Salvando..." : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function StatusBadge({ status }: { status: "pago" | "pendente" }) {
  return (
    <Badge
      variant="outline"
      className={
        status === "pago"
          ? "bg-success/15 text-success border-success/30"
          : "bg-warning/15 text-warning-foreground border-warning/30"
      }
    >
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
