import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/hooks/useCurrentUser";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MonthFilter, formatMonthLabel } from "@/components/MonthFilter";
import { todayISO } from "@/lib/format";
import {
  UserCheck,
  UserX,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  MessageCircle,
  Download,
  CalendarCheck,
  FileText,
  Clock,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atendimentos")({
  head: () => ({
    meta: [
      { title: "Atendimentos — CobraZap" },
      { name: "description", content: "Controle de atendimentos mensais dos clientes cadastrados." },
    ],
  }),
  component: AtendimentosPage,
});

type Cliente = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  documento: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
};

type AtendimentoItem = {
  atendido: boolean;
  atendido_em?: string;
  observacao?: string;
};

type AtendimentosMap = Record<string, AtendimentoItem>;

function cleanPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

function AtendimentosPage() {
  const qc = useQueryClient();
  const currentMonth = todayISO().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "sim" | "nao">("todos");
  const [observacaoModal, setObservacaoModal] = useState<{ cliente: Cliente; item?: AtendimentoItem } | null>(null);
  const [obsText, setObsText] = useState("");

  const storageKey = `atendimentos_${selectedMonth}`;

  // 1. Busca lista de clientes cadastrados
  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Cliente[];
    },
  });

  // 2. Busca o registro de atendimentos do mês selecionado
  const { data: atendimentosData = {}, isLoading: loadingAtendimentos } = useQuery({
    queryKey: ["atendimentos", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("value")
        .eq("key", storageKey)
        .maybeSingle();

      if (error) throw error;
      if (!data?.value) return {} as AtendimentosMap;

      try {
        const parsed = JSON.parse(data.value);
        return (parsed.clientes || parsed) as AtendimentosMap;
      } catch {
        return {} as AtendimentosMap;
      }
    },
  });

  // Mutação para salvar os atendimentos no Supabase
  const saveAtendimentos = useMutation({
    mutationFn: async (newMap: AtendimentosMap) => {
      const user_id = await currentUserId();
      const payload = {
        clientes: newMap,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("configuracoes").upsert(
        {
          user_id,
          key: storageKey,
          value: JSON.stringify(payload),
        },
        { onConflict: "user_id,key" }
      );
      if (error) throw error;
      return newMap;
    },
    onMutate: async (newMap) => {
      await qc.cancelQueries({ queryKey: ["atendimentos", selectedMonth] });
      const previous = qc.getQueryData<AtendimentosMap>(["atendimentos", selectedMonth]);
      qc.setQueryData(["atendimentos", selectedMonth], newMap);
      return { previous };
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["atendimentos", selectedMonth], context.previous);
      }
      toast.error(`Erro ao salvar atendimento: ${err.message}`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["atendimentos", selectedMonth] });
    },
  });

  // Alternar atendimento de um cliente específico (Sim / Não)
  const toggleAtendimento = (clienteId: string, clienteNome: string) => {
    const current = atendimentosData[clienteId];
    const willBeAtendido = !current?.atendido;

    const updated: AtendimentosMap = {
      ...atendimentosData,
      [clienteId]: {
        ...current,
        atendido: willBeAtendido,
        atendido_em: willBeAtendido ? new Date().toISOString() : undefined,
      },
    };

    saveAtendimentos.mutate(updated);
    if (willBeAtendido) {
      toast.success(`${clienteNome} marcado como atendido em ${formatMonthLabel(selectedMonth)}!`);
    } else {
      toast.info(`Atendimento de ${clienteNome} desmarcado.`);
    }
  };

  // Salvar anotação/observação do atendimento
  const handleSaveObservacao = () => {
    if (!observacaoModal) return;
    const { cliente } = observacaoModal;
    const current = atendimentosData[cliente.id] || { atendido: true, atendido_em: new Date().toISOString() };

    const updated: AtendimentosMap = {
      ...atendimentosData,
      [cliente.id]: {
        ...current,
        atendido: true,
        atendido_em: current.atendido_em || new Date().toISOString(),
        observacao: obsText.trim() || undefined,
      },
    };

    saveAtendimentos.mutate(updated);
    toast.success(`Observação de ${cliente.nome} salva!`);
    setObservacaoModal(null);
    setObsText("");
  };

  // Marcar todos os clientes filtrados como Sim
  const handleMarcarTodos = () => {
    if (filteredClientes.length === 0) return;
    if (!confirm(`Deseja marcar todos os ${filteredClientes.length} clientes listados como atendidos no mês de ${formatMonthLabel(selectedMonth)}?`)) {
      return;
    }

    const updated: AtendimentosMap = { ...atendimentosData };
    const now = new Date().toISOString();
    filteredClientes.forEach((c) => {
      updated[c.id] = {
        ...(updated[c.id] || {}),
        atendido: true,
        atendido_em: updated[c.id]?.atendido_em || now,
      };
    });

    saveAtendimentos.mutate(updated);
    toast.success(`${filteredClientes.length} clientes marcados como atendidos!`);
  };

  // Limpar/desmarcar todos do mês
  const handleLimparTodos = () => {
    if (!confirm(`Deseja desmarcar o status de atendimento de todos os clientes no mês de ${formatMonthLabel(selectedMonth)}?`)) {
      return;
    }
    saveAtendimentos.mutate({});
    toast.info(`Atendimentos de ${formatMonthLabel(selectedMonth)} foram resetados.`);
  };

  // Filtros aplicados
  const filteredClientes = useMemo(() => {
    return clientes.filter((c) => {
      const matchSearch = (
        c.nome +
        " " +
        c.telefone +
        " " +
        (c.email ?? "") +
        " " +
        (c.documento ?? "") +
        " " +
        (c.observacoes ?? "")
      )
        .toLowerCase()
        .includes(search.toLowerCase());

      if (!matchSearch) return false;

      const isAtendido = !!atendimentosData[c.id]?.atendido;
      if (statusFilter === "sim") return isAtendido;
      if (statusFilter === "nao") return !isAtendido;
      return true;
    });
  }, [clientes, search, statusFilter, atendimentosData]);

  // Estatísticas do mês
  const stats = useMemo(() => {
    const total = clientes.length;
    const atendidosCount = clientes.filter((c) => atendimentosData[c.id]?.atendido).length;
    const pendentesCount = total - atendidosCount;
    const porcentagem = total > 0 ? Math.round((atendidosCount / total) * 100) : 0;

    return { total, atendidosCount, pendentesCount, porcentagem };
  }, [clientes, atendimentosData]);

  // Exportar relatório de atendimentos em CSV
  const exportCSV = () => {
    const headers = ["Nome", "Telefone", "Email", "Documento", "Atendido no Mês", "Data/Hora Atendimento", "Observações"];
    const rows = filteredClientes.map((c) => {
      const at = atendimentosData[c.id];
      const atendidoTxt = at?.atendido ? "SIM" : "NÃO";
      const dataTxt = at?.atendido_em ? new Date(at.atendido_em).toLocaleString("pt-BR") : "";
      const obsTxt = (at?.observacao || "").replace(/"/g, '""');

      return [
        `"${c.nome.replace(/"/g, '""')}"`,
        `"${c.telefone}"`,
        `"${c.email ?? ""}"`,
        `"${c.documento ?? ""}"`,
        `"${atendidoTxt}"`,
        `"${dataTxt}"`,
        `"${obsTxt}"`,
      ].join(";");
    });

    const csvContent = "\uFEFF" + headers.join(";") + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `atendimentos-${selectedMonth}.csv`;
    link.click();
    toast.success("Relatório de atendimentos exportado com sucesso!");
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
        <PageHeader
          title="Atendimentos"
          subtitle="Controle e confirme os atendimentos mensais de cada cliente"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={clientes.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>
          }
        />

        {/* Barra superior de Filtro por Mês */}
        <Card className="mb-6 border-primary/20 bg-card/60 backdrop-blur-sm shadow-sm">
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <CalendarCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Mês de Referência
                </div>
                <div className="text-base font-bold text-foreground">
                  {formatMonthLabel(selectedMonth)}
                </div>
              </div>
            </div>

            <MonthFilter
              selectedMonth={selectedMonth}
              onChange={(m) => setSelectedMonth(m === "todos" ? currentMonth : m)}
              allowAll={false}
            />
          </CardContent>
        </Card>

        {/* Cards de Métricas do Mês */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="shadow-sm">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total de Clientes</p>
                <p className="text-2xl font-bold mt-1">{stats.total}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cadastrados no sistema</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                <Users className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-success/30 bg-success/5">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-success uppercase tracking-wide">Atendidos (Sim)</p>
                <p className="text-2xl font-bold text-success mt-1">{stats.atendidosCount}</p>
                <p className="text-xs text-success/80 mt-0.5">{stats.porcentagem}% do total</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-success/15 flex items-center justify-center text-success">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  Pendentes (Não)
                </p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.pendentesCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Aguardando atendimento</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <UserX className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Progresso Mensal</p>
                <span className="text-sm font-bold text-primary">{stats.porcentagem}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 mb-2 overflow-hidden">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${stats.porcentagem}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {stats.atendidosCount} de {stats.total} clientes confirmados
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros rápidos e busca */}
        <Card className="mb-4">
          <CardContent className="p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, telefone, documento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-muted/70 p-1 rounded-lg border text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter("todos")}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    statusFilter === "todos"
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Todos ({clientes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("sim")}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                    statusFilter === "sim"
                      ? "bg-success text-success-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Atendidos ({stats.atendidosCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("nao")}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                    statusFilter === "nao"
                      ? "bg-destructive/90 text-destructive-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Pendentes ({stats.pendentesCount})
                </button>
              </div>

              {filteredClientes.length > 0 && (
                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleMarcarTodos}
                    title="Marcar todos visíveis como atendidos"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1 text-primary" />
                    Marcar todos Sim
                  </Button>
                  {stats.atendidosCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground hover:text-destructive"
                      onClick={handleLimparTodos}
                      title="Resetar atendimentos deste mês"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Resetar
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Clientes Espelhada */}
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="bg-muted/30 border-b py-3 px-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Clientes e Confirmação de Atendimento
              </CardTitle>
              <CardDescription className="text-xs">
                Mês de {formatMonthLabel(selectedMonth)} • {filteredClientes.length} cliente(s) listado(s)
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingClientes || loadingAtendimentos ? (
              <div className="py-16 text-center text-muted-foreground">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                Carregando clientes e atendimentos...
              </div>
            ) : filteredClientes.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                {clientes.length === 0 ? (
                  <div>
                    <UserX className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="font-medium">Nenhum cliente cadastrado no sistema</p>
                    <p className="text-xs mt-1">Cadastre clientes no menu "Clientes" para gerenciar atendimentos.</p>
                  </div>
                ) : (
                  <div>
                    <Search className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="font-medium">Nenhum cliente encontrado com os filtros atuais</p>
                    <p className="text-xs mt-1">Tente ajustar o termo de busca ou o filtro de status.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-center px-4 py-3 w-28">Atendido?</th>
                      <th className="text-left px-4 py-3">Cliente</th>
                      <th className="text-left px-4 py-3">Telefone (WhatsApp)</th>
                      <th className="text-left px-4 py-3">Status no Mês</th>
                      <th className="text-left px-4 py-3">Observações do Mês</th>
                      <th className="text-right px-4 py-3">Ações Rápidas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredClientes.map((c) => {
                      const item = atendimentosData[c.id];
                      const isAtendido = !!item?.atendido;
                      const atendidoEm = item?.atendido_em
                        ? new Date(item.atendido_em).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : null;

                      return (
                        <tr
                          key={c.id}
                          className={`transition-colors hover:bg-muted/30 ${
                            isAtendido ? "bg-success/[0.02]" : ""
                          }`}
                        >
                          {/* Opção de Marcar com Sim/Não */}
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Switch
                                checked={isAtendido}
                                onCheckedChange={() => toggleAtendimento(c.id, c.nome)}
                                className="data-[state=checked]:bg-success"
                                aria-label={`Marcar ${c.nome} como atendido`}
                              />
                              <span
                                className={`text-xs font-bold w-7 text-left ${
                                  isAtendido ? "text-success" : "text-muted-foreground"
                                }`}
                              >
                                {isAtendido ? "SIM" : "NÃO"}
                              </span>
                            </div>
                          </td>

                          {/* Dados do Cliente */}
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-foreground flex items-center gap-2">
                              <span>{c.nome}</span>
                              {!c.ativo && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  Inativo
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                              {c.documento && <span>Doc: {c.documento}</span>}
                              {c.email && <span>• {c.email}</span>}
                            </div>
                          </td>

                          {/* Telefone / WhatsApp */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">{c.telefone}</span>
                              <a
                                href={`https://wa.me/${cleanPhoneForWhatsApp(c.telefone)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 p-1 rounded hover:bg-emerald-500/10 transition-colors"
                                title="Abrir conversa no WhatsApp"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </a>
                            </div>
                          </td>

                          {/* Status no Mês */}
                          <td className="px-4 py-3.5">
                            {isAtendido ? (
                              <div className="space-y-0.5">
                                <Badge className="bg-success/15 text-success hover:bg-success/20 border-success/30 font-medium gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Atendido (SIM)
                                </Badge>
                                {atendidoEm && (
                                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Confirmado em {atendidoEm}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground border-dashed gap-1 font-normal">
                                <XCircle className="h-3 w-3 text-muted-foreground" />
                                Pendente (NÃO)
                              </Badge>
                            )}
                          </td>

                          {/* Observações do Atendimento */}
                          <td className="px-4 py-3.5">
                            {item?.observacao ? (
                              <div
                                onClick={() => {
                                  setObservacaoModal({ cliente: c, item });
                                  setObsText(item.observacao || "");
                                }}
                                className="cursor-pointer group flex items-start gap-1.5 text-xs text-muted-foreground hover:text-foreground max-w-xs"
                                title="Clique para editar observação"
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                                <span className="truncate group-hover:underline">{item.observacao}</span>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                                onClick={() => {
                                  setObservacaoModal({ cliente: c, item });
                                  setObsText("");
                                }}
                              >
                                <FileText className="h-3.5 w-3.5 mr-1" />
                                + Nota
                              </Button>
                            )}
                          </td>

                          {/* Ações Rápidas */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant={isAtendido ? "outline" : "default"}
                                className={`h-8 text-xs font-semibold ${
                                  isAtendido
                                    ? "text-success border-success/30 hover:bg-success/10 hover:text-success"
                                    : "bg-primary hover:bg-primary/90"
                                }`}
                                onClick={() => toggleAtendimento(c.id, c.nome)}
                              >
                                {isAtendido ? (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                    Confirmado
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                                    Marcar SIM
                                  </>
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal para anotação/observação rápida do atendimento */}
        <Dialog open={!!observacaoModal} onOpenChange={(open) => !open && setObservacaoModal(null)}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary" />
                Nota de Atendimento: {observacaoModal?.cliente.nome}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="text-xs text-muted-foreground">
                Mês de referência: <strong className="text-foreground">{formatMonthLabel(selectedMonth)}</strong>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="obs-text">Observações sobre o atendimento</Label>
                <Textarea
                  id="obs-text"
                  placeholder="Ex: Suporte técnico presencial, atualização de sistema realizada, contato por telefone..."
                  rows={4}
                  value={obsText}
                  onChange={(e) => setObsText(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setObservacaoModal(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveObservacao}>Salvar Nota</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
