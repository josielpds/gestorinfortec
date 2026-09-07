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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Tag,
  Monitor,
  Copy,
  Pencil,
  Trash2,
  FileSpreadsheet,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atendimentos")({
  head: () => ({
    meta: [
      { title: "Atendimentos — CobraZap" },
      { name: "description", content: "Controle de atendimentos mensais: Relatórios de Início e Verificação de Final de Mês." },
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

type MonthAtendimentosData = {
  inicio: AtendimentosMap;
  final: AtendimentosMap;
};

type CategoriasClientesMap = Record<string, string>;
type CategoriasPorTipo = {
  inicio: CategoriasClientesMap;
  final: CategoriasClientesMap;
};
type AcessoRemotoMap = Record<string, string>;

export type TipoAtendimento = "inicio" | "final";
export type TipoAtendimentoFilter = "inicio" | "final" | "ambos";

export const ATENDIMENTO_CATEGORIAS = ["EU", "EU-NOC", "IR", "REM"] as const;
export type AtendimentoCategoria = (typeof ATENDIMENTO_CATEGORIAS)[number];

const CATEGORIA_STYLES: Record<string, { badge: string; pill: string; label: string; dot: string }> = {
  EU: {
    badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-400/40 hover:bg-blue-500/25",
    pill: "bg-blue-600 text-white",
    label: "EU",
    dot: "bg-blue-500",
  },
  "EU-NOC": {
    badge: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-400/40 hover:bg-purple-500/25",
    pill: "bg-purple-600 text-white",
    label: "EU-NOC",
    dot: "bg-purple-500",
  },
  IR: {
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-400/40 hover:bg-amber-500/25",
    pill: "bg-amber-600 text-white",
    label: "IR",
    dot: "bg-amber-500",
  },
  REM: {
    badge: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-400/40 hover:bg-teal-500/25",
    pill: "bg-teal-600 text-white",
    label: "REM",
    dot: "bg-teal-500",
  },
};

function CategoriaSelector({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (val: string | null) => void;
  className?: string;
}) {
  return (
    <Select
      value={value || "none"}
      onValueChange={(val) => onChange(val === "none" ? null : val)}
    >
      <SelectTrigger
        className={`h-7.5 text-xs font-semibold border bg-background/80 hover:bg-muted/50 cursor-pointer ${
          className || "w-[125px]"
        }`}
      >
        <SelectValue placeholder="Sem categoria">
          {value ? (
            <span className="flex items-center gap-1.5 font-bold truncate">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  CATEGORIA_STYLES[value]?.dot || "bg-muted-foreground"
                }`}
              />
              <span>{value}</span>
            </span>
          ) : (
            <span className="text-muted-foreground font-normal truncate">Sem categoria</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none" className="text-xs text-muted-foreground cursor-pointer">
          — Sem Categoria
        </SelectItem>
        {ATENDIMENTO_CATEGORIAS.map((cat) => {
          const style = CATEGORIA_STYLES[cat];
          return (
            <SelectItem key={cat} value={cat} className="text-xs font-medium cursor-pointer">
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                <span className="font-bold">{cat}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

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
  const [tipoFilter, setTipoFilter] = useState<TipoAtendimentoFilter>("ambos");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "sim" | "nao">("todos");
  const [categoryFilter, setCategoryFilter] = useState<string>("todas");

  // Modal para nota/observação
  const [observacaoModal, setObservacaoModal] = useState<{
    cliente: Cliente;
    tipo: TipoAtendimento;
    item?: AtendimentoItem;
  } | null>(null);
  const [obsText, setObsText] = useState("");

  // Modal para ID de acesso remoto
  const [remoteIdModal, setRemoteIdModal] = useState<{ cliente: Cliente; currentId: string } | null>(null);
  const [remoteIdText, setRemoteIdText] = useState("");

  const storageKey = `atendimentos_${selectedMonth}`;
  const catStorageKey = `atendimentos_categorias_clientes`;
  const remoteIdStorageKey = `atendimentos_acesso_remoto`;

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

  // 2. Busca o registro de atendimentos do mês (Início + Final) com compatibilidade retroativa
  const { data: atendimentosData = { inicio: {}, final: {} }, isLoading: loadingAtendimentos } = useQuery<MonthAtendimentosData>({
    queryKey: ["atendimentos", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("value")
        .eq("key", storageKey)
        .maybeSingle();

      if (error) throw error;
      if (!data?.value) return { inicio: {}, final: {} };

      try {
        const parsed = JSON.parse(data.value);
        // Formato novo com separação de início e final
        if (parsed.inicio || parsed.final) {
          return {
            inicio: parsed.inicio || {},
            final: parsed.final || {},
          };
        }
        // Migração de formato legadado (clientes únicos vão para 'final' ou padrão)
        const legacy = (parsed.clientes || parsed) as AtendimentosMap;
        return {
          inicio: {},
          final: legacy || {},
        };
      } catch {
        return { inicio: {}, final: {} };
      }
    },
  });

  // 3. Busca a atribuição de categorias exclusivas dos atendimentos (EU, EU-NOC, IR, REM) por tipo (inicio / final)
  const { data: clientCategories = { inicio: {}, final: {} } } = useQuery<CategoriasPorTipo>({
    queryKey: ["atendimentos_categorias_clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("value")
        .eq("key", catStorageKey)
        .maybeSingle();

      if (error) throw error;
      if (!data?.value) return { inicio: {}, final: {} };

      try {
        const parsed = JSON.parse(data.value);
        if (parsed.inicio || parsed.final) {
          return {
            inicio: (parsed.inicio as CategoriasClientesMap) || {},
            final: (parsed.final as CategoriasClientesMap) || {},
          };
        }
        // Migração de formato legado: replica para inicio e final inicialmente
        const legacy = parsed as CategoriasClientesMap;
        return {
          inicio: { ...legacy },
          final: { ...legacy },
        };
      } catch {
        return { inicio: {}, final: {} };
      }
    },
  });

  // 4. Busca os IDs de Acesso Remoto de cada cliente
  const { data: remoteAccessIds = {} } = useQuery<AcessoRemotoMap>({
    queryKey: ["atendimentos_acesso_remoto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("value")
        .eq("key", remoteIdStorageKey)
        .maybeSingle();

      if (error) throw error;
      if (!data?.value) return {};

      try {
        return JSON.parse(data.value) as AcessoRemotoMap;
      } catch {
        return {};
      }
    },
  });

  // Mutação para salvar a categoria de um cliente para um tipo específico (inicio ou final)
  const setClientCategory = useMutation({
    mutationFn: async ({
      clienteId,
      tipo,
      categoria,
    }: {
      clienteId: string;
      tipo: TipoAtendimento;
      categoria: string | null;
    }) => {
      const user_id = await currentUserId();
      const updated: CategoriasPorTipo = {
        inicio: { ...clientCategories.inicio },
        final: { ...clientCategories.final },
      };

      if (categoria && categoria !== "none") {
        updated[tipo][clienteId] = categoria;
      } else {
        delete updated[tipo][clienteId];
      }

      const { error } = await supabase.from("configuracoes").upsert(
        {
          user_id,
          key: catStorageKey,
          value: JSON.stringify(updated),
        },
        { onConflict: "user_id,key" }
      );
      if (error) throw error;
      return updated;
    },
    onMutate: async ({ clienteId, tipo, categoria }) => {
      await qc.cancelQueries({ queryKey: ["atendimentos_categorias_clientes"] });
      const previous = qc.getQueryData<CategoriasPorTipo>(["atendimentos_categorias_clientes"]);
      const updated: CategoriasPorTipo = {
        inicio: { ...(previous?.inicio || {}) },
        final: { ...(previous?.final || {}) },
      };

      if (categoria && categoria !== "none") {
        updated[tipo][clienteId] = categoria;
      } else {
        delete updated[tipo][clienteId];
      }

      qc.setQueryData(["atendimentos_categorias_clientes"], updated);
      return { previous };
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["atendimentos_categorias_clientes"], context.previous);
      }
      toast.error(`Erro ao salvar categoria: ${err.message}`);
    },
    onSuccess: (_, vars) => {
      const tipoLabel = vars.tipo === "inicio" ? "Início" : "Final";
      toast.success(
        vars.categoria && vars.categoria !== "none"
          ? `Categoria "${vars.categoria}" (${tipoLabel}) atribuída`
          : `Categoria de ${tipoLabel} removida`
      );
      qc.invalidateQueries({ queryKey: ["atendimentos_categorias_clientes"] });
    },
  });

  // Mutação para salvar o ID de acesso remoto de um cliente
  const setRemoteAccessId = useMutation({
    mutationFn: async ({ clienteId, remoteId }: { clienteId: string; remoteId: string | null }) => {
      const user_id = await currentUserId();
      const updated: AcessoRemotoMap = { ...remoteAccessIds };
      const trimmed = remoteId ? remoteId.trim() : "";
      if (trimmed) {
        updated[clienteId] = trimmed;
      } else {
        delete updated[clienteId];
      }

      const { error } = await supabase.from("configuracoes").upsert(
        {
          user_id,
          key: remoteIdStorageKey,
          value: JSON.stringify(updated),
        },
        { onConflict: "user_id,key" }
      );
      if (error) throw error;
      return updated;
    },
    onMutate: async ({ clienteId, remoteId }) => {
      await qc.cancelQueries({ queryKey: ["atendimentos_acesso_remoto"] });
      const previous = qc.getQueryData<AcessoRemotoMap>(["atendimentos_acesso_remoto"]);
      const updated: AcessoRemotoMap = { ...(previous || {}) };
      const trimmed = remoteId ? remoteId.trim() : "";
      if (trimmed) {
        updated[clienteId] = trimmed;
      } else {
        delete updated[clienteId];
      }
      qc.setQueryData(["atendimentos_acesso_remoto"], updated);
      return { previous };
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["atendimentos_acesso_remoto"], context.previous);
      }
      toast.error(`Erro ao salvar ID de acesso remoto: ${err.message}`);
    },
    onSuccess: (_, vars) => {
      toast.success(
        vars.remoteId && vars.remoteId.trim()
          ? `ID de Acesso Remoto salvo com sucesso!`
          : "ID de Acesso Remoto removido."
      );
      qc.invalidateQueries({ queryKey: ["atendimentos_acesso_remoto"] });
    },
  });

  // Salvar ID de acesso remoto pelo modal
  const handleSaveRemoteId = () => {
    if (!remoteIdModal) return;
    const { cliente } = remoteIdModal;
    setRemoteAccessId.mutate({
      clienteId: cliente.id,
      remoteId: remoteIdText,
    });
    setRemoteIdModal(null);
    setRemoteIdText("");
  };

  // Copiar ID para área de transferência
  const copyToClipboard = (text: string, label: string = "ID") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado: ${text}`);
  };

  // Mutação para salvar os atendimentos no Supabase
  const saveAtendimentos = useMutation({
    mutationFn: async (newData: MonthAtendimentosData) => {
      const user_id = await currentUserId();
      const payload = {
        inicio: newData.inicio,
        final: newData.final,
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
      return newData;
    },
    onMutate: async (newData) => {
      await qc.cancelQueries({ queryKey: ["atendimentos", selectedMonth] });
      const previous = qc.getQueryData<MonthAtendimentosData>(["atendimentos", selectedMonth]);
      qc.setQueryData(["atendimentos", selectedMonth], newData);
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

  // Alternar atendimento de um cliente específico em um tipo específico (inicio ou final)
  const toggleAtendimento = (clienteId: string, clienteNome: string, tipo: TipoAtendimento) => {
    const currentTipoMap = atendimentosData[tipo] || {};
    const currentItem = currentTipoMap[clienteId];
    const willBeAtendido = !currentItem?.atendido;

    const updatedTipoMap: AtendimentosMap = {
      ...currentTipoMap,
      [clienteId]: {
        ...currentItem,
        atendido: willBeAtendido,
        atendido_em: willBeAtendido ? new Date().toISOString() : undefined,
      },
    };

    const updatedData: MonthAtendimentosData = {
      ...atendimentosData,
      [tipo]: updatedTipoMap,
    };

    saveAtendimentos.mutate(updatedData);

    const tipoLabel = tipo === "inicio" ? "Relatório (Início)" : "Verificação (Final)";
    if (willBeAtendido) {
      toast.success(`${clienteNome}: ${tipoLabel} marcado como realizado em ${formatMonthLabel(selectedMonth)}!`);
    } else {
      toast.info(`${clienteNome}: ${tipoLabel} desmarcado.`);
    }
  };

  // Salvar anotação/observação do atendimento
  const handleSaveObservacao = () => {
    if (!observacaoModal) return;
    const { cliente, tipo } = observacaoModal;
    const currentTipoMap = atendimentosData[tipo] || {};
    const current = currentTipoMap[cliente.id] || { atendido: true, atendido_em: new Date().toISOString() };

    const updatedTipoMap: AtendimentosMap = {
      ...currentTipoMap,
      [cliente.id]: {
        ...current,
        atendido: true,
        atendido_em: current.atendido_em || new Date().toISOString(),
        observacao: obsText.trim() || undefined,
      },
    };

    const updatedData: MonthAtendimentosData = {
      ...atendimentosData,
      [tipo]: updatedTipoMap,
    };

    saveAtendimentos.mutate(updatedData);
    const tipoLabel = tipo === "inicio" ? "Relatório (Início)" : "Verificação (Final)";
    toast.success(`Nota de ${tipoLabel} salva para ${cliente.nome}!`);
    setObservacaoModal(null);
    setObsText("");
  };

  // Marcar todos os clientes filtrados como Sim (para o tipo ativo ou ambos)
  const handleMarcarTodos = () => {
    if (filteredClientes.length === 0) return;

    const tipoDesc =
      tipoFilter === "inicio"
        ? "Relatórios de Início do Mês"
        : tipoFilter === "final"
        ? "Verificação de Final do Mês"
        : "Início e Final do Mês";

    if (
      !confirm(
        `Deseja marcar todos os ${filteredClientes.length} clientes listados como atendidos para [${tipoDesc}] em ${formatMonthLabel(
          selectedMonth
        )}?`
      )
    ) {
      return;
    }

    const now = new Date().toISOString();
    const updatedInicio = { ...atendimentosData.inicio };
    const updatedFinal = { ...atendimentosData.final };

    filteredClientes.forEach((c) => {
      if (tipoFilter === "inicio" || tipoFilter === "ambos") {
        updatedInicio[c.id] = {
          ...(updatedInicio[c.id] || {}),
          atendido: true,
          atendido_em: updatedInicio[c.id]?.atendido_em || now,
        };
      }
      if (tipoFilter === "final" || tipoFilter === "ambos") {
        updatedFinal[c.id] = {
          ...(updatedFinal[c.id] || {}),
          atendido: true,
          atendido_em: updatedFinal[c.id]?.atendido_em || now,
        };
      }
    });

    saveAtendimentos.mutate({
      inicio: updatedInicio,
      final: updatedFinal,
    });
    toast.success(`${filteredClientes.length} clientes marcados como atendidos (${tipoDesc})!`);
  };

  // Limpar/desmarcar todos do mês
  const handleLimparTodos = () => {
    const tipoDesc =
      tipoFilter === "inicio"
        ? "Relatórios de Início"
        : tipoFilter === "final"
        ? "Verificação de Final"
        : "todos os atendimentos (Início e Final)";

    if (
      !confirm(
        `Deseja desmarcar o status de ${tipoDesc} de todos os clientes no mês de ${formatMonthLabel(selectedMonth)}?`
      )
    ) {
      return;
    }

    if (tipoFilter === "inicio") {
      saveAtendimentos.mutate({ ...atendimentosData, inicio: {} });
    } else if (tipoFilter === "final") {
      saveAtendimentos.mutate({ ...atendimentosData, final: {} });
    } else {
      saveAtendimentos.mutate({ inicio: {}, final: {} });
    }
    toast.info(`Atendimentos de ${formatMonthLabel(selectedMonth)} foram resetados.`);
  };

  // Contagem por categoria (com base no tipo selecionado)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      todas: clientes.length,
      EU: 0,
      "EU-NOC": 0,
      IR: 0,
      REM: 0,
      sem_categoria: 0,
    };

    clientes.forEach((c) => {
      const catInicio = clientCategories.inicio[c.id];
      const catFinal = clientCategories.final[c.id];

      if (tipoFilter === "inicio") {
        if (catInicio && counts[catInicio] !== undefined) {
          counts[catInicio]++;
        } else {
          counts.sem_categoria++;
        }
      } else if (tipoFilter === "final") {
        if (catFinal && counts[catFinal] !== undefined) {
          counts[catFinal]++;
        } else {
          counts.sem_categoria++;
        }
      } else {
        // Modo "ambos": se tem categoria em qualquer um dos dois ciclos
        const cat = catInicio || catFinal;
        if (cat && counts[cat] !== undefined) {
          counts[cat]++;
        } else {
          counts.sem_categoria++;
        }
      }
    });

    return counts;
  }, [clientes, clientCategories, tipoFilter]);

  // Estatísticas completas do mês
  const stats = useMemo(() => {
    const total = clientes.length;

    const inicioCount = clientes.filter((c) => atendimentosData.inicio[c.id]?.atendido).length;
    const inicioPendentes = total - inicioCount;
    const inicioPercent = total > 0 ? Math.round((inicioCount / total) * 100) : 0;

    const finalCount = clientes.filter((c) => atendimentosData.final[c.id]?.atendido).length;
    const finalPendentes = total - finalCount;
    const finalPercent = total > 0 ? Math.round((finalCount / total) * 100) : 0;

    const ambosCount = clientes.filter(
      (c) => atendimentosData.inicio[c.id]?.atendido && atendimentosData.final[c.id]?.atendido
    ).length;
    const ambosPercent = total > 0 ? Math.round((ambosCount / total) * 100) : 0;

    // Estatísticas ativas com base no filtro selecionado
    let currentAtendidos = ambosCount;
    let currentPendentes = total - ambosCount;
    let currentPercent = ambosPercent;

    if (tipoFilter === "inicio") {
      currentAtendidos = inicioCount;
      currentPendentes = inicioPendentes;
      currentPercent = inicioPercent;
    } else if (tipoFilter === "final") {
      currentAtendidos = finalCount;
      currentPendentes = finalPendentes;
      currentPercent = finalPercent;
    }

    return {
      total,
      inicioCount,
      inicioPendentes,
      inicioPercent,
      finalCount,
      finalPendentes,
      finalPercent,
      ambosCount,
      ambosPercent,
      currentAtendidos,
      currentPendentes,
      currentPercent,
    };
  }, [clientes, atendimentosData, tipoFilter]);

  // Filtros aplicados (Busca + Tipo de Atendimento + Status + Categoria)
  const filteredClientes = useMemo(() => {
    return clientes.filter((c) => {
      const catInicio = clientCategories.inicio[c.id] || "";
      const catFinal = clientCategories.final[c.id] || "";
      const remoteId = remoteAccessIds[c.id] || "";

      // 1. Filtro de Categoria
      if (categoryFilter !== "todas") {
        if (categoryFilter === "sem_categoria") {
          if (tipoFilter === "inicio" && catInicio) return false;
          if (tipoFilter === "final" && catFinal) return false;
          if (tipoFilter === "ambos" && (catInicio || catFinal)) return false;
        } else {
          if (tipoFilter === "inicio" && catInicio !== categoryFilter) return false;
          if (tipoFilter === "final" && catFinal !== categoryFilter) return false;
          if (tipoFilter === "ambos" && catInicio !== categoryFilter && catFinal !== categoryFilter) return false;
        }
      }

      // 2. Filtro de Busca
      const matchSearch = (
        c.nome +
        " " +
        c.telefone +
        " " +
        (c.email ?? "") +
        " " +
        (c.documento ?? "") +
        " " +
        (c.observacoes ?? "") +
        " " +
        catInicio +
        " " +
        catFinal +
        " " +
        remoteId
      )
        .toLowerCase()
        .includes(search.toLowerCase());

      if (!matchSearch) return false;

      // 3. Filtro de Status de Atendimento no Mês
      const isInicioAtendido = !!atendimentosData.inicio[c.id]?.atendido;
      const isFinalAtendido = !!atendimentosData.final[c.id]?.atendido;

      if (statusFilter === "sim") {
        if (tipoFilter === "inicio") return isInicioAtendido;
        if (tipoFilter === "final") return isFinalAtendido;
        return isInicioAtendido && isFinalAtendido;
      }
      if (statusFilter === "nao") {
        if (tipoFilter === "inicio") return !isInicioAtendido;
        if (tipoFilter === "final") return !isFinalAtendido;
        return !isInicioAtendido || !isFinalAtendido;
      }

      return true;
    });
  }, [clientes, search, statusFilter, categoryFilter, tipoFilter, atendimentosData, clientCategories, remoteAccessIds]);

  // Exportar relatório completo de atendimentos em CSV
  const exportCSV = () => {
    const headers = [
      "Nome",
      "Categoria (Início)",
      "Categoria (Final)",
      "ID Acesso Remoto",
      "Telefone",
      "Email",
      "Documento",
      "Relatório Início (Status)",
      "Relatório Início (Data/Hora)",
      "Relatório Início (Observação)",
      "Verificação Final (Status)",
      "Verificação Final (Data/Hora)",
      "Verificação Final (Observação)",
      "Status Geral do Mês",
    ];

    const rows = filteredClientes.map((c) => {
      const atInicio = atendimentosData.inicio[c.id];
      const atFinal = atendimentosData.final[c.id];
      const catInicio = clientCategories.inicio[c.id] || "Sem Categoria";
      const catFinal = clientCategories.final[c.id] || "Sem Categoria";
      const remoteId = remoteAccessIds[c.id] || "";

      const inicioStatus = atInicio?.atendido ? "SIM" : "NÃO";
      const inicioData = atInicio?.atendido_em ? new Date(atInicio.atendido_em).toLocaleString("pt-BR") : "";
      const inicioObs = (atInicio?.observacao || "").replace(/"/g, '""');

      const finalStatus = atFinal?.atendido ? "SIM" : "NÃO";
      const finalData = atFinal?.atendido_em ? new Date(atFinal.atendido_em).toLocaleString("pt-BR") : "";
      const finalObs = (atFinal?.observacao || "").replace(/"/g, '""');

      let statusGeral = "Pendente";
      if (atInicio?.atendido && atFinal?.atendido) {
        statusGeral = "100% Concluído (Início e Final)";
      } else if (atInicio?.atendido) {
        statusGeral = "Parcial (Somente Início)";
      } else if (atFinal?.atendido) {
        statusGeral = "Parcial (Somente Final)";
      }

      return [
        `"${c.nome.replace(/"/g, '""')}"`,
        `"${catInicio}"`,
        `"${catFinal}"`,
        `"${remoteId.replace(/"/g, '""')}"`,
        `"${c.telefone}"`,
        `"${c.email ?? ""}"`,
        `"${c.documento ?? ""}"`,
        `"${inicioStatus}"`,
        `"${inicioData}"`,
        `"${inicioObs}"`,
        `"${finalStatus}"`,
        `"${finalData}"`,
        `"${finalObs}"`,
        `"${statusGeral}"`,
      ].join(";");
    });

    const csvContent = "\uFEFF" + headers.join(";") + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `atendimentos-${selectedMonth}-${tipoFilter}.csv`;
    link.click();
    toast.success("Relatório detalhado de atendimentos exportado com sucesso!");
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1440px]">
        <PageHeader
          title="Atendimentos Mensais"
          subtitle="Controle independente de Relatórios de Início do Mês e Verificação de Final de Mês"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={clientes.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV Completo
              </Button>
            </div>
          }
        />

        {/* 1. Barra Superior: Mês de Referência e Seletor do Tipo de Atendimento */}
        <Card className="mb-6 border-primary/20 bg-card/70 backdrop-blur-sm shadow-sm">
          <CardContent className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Mês e Título */}
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <CalendarCheck className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Mês de Referência
                </div>
                <div className="text-lg font-bold text-foreground">
                  {formatMonthLabel(selectedMonth)}
                </div>
              </div>
            </div>

            {/* Seletor de Tipo / Ciclo de Atendimento */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1 hidden sm:inline-block">
                Ciclo do Mês:
              </div>
              <div className="flex items-center bg-muted/80 p-1 rounded-xl border">
                <button
                  type="button"
                  onClick={() => setTipoFilter("inicio")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    tipoFilter === "inicio"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Relatórios (Início)</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                      tipoFilter === "inicio" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {stats.inicioCount}/{stats.total}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTipoFilter("final")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    tipoFilter === "final"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Verificação (Final)</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                      tipoFilter === "final" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {stats.finalCount}/{stats.total}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTipoFilter("ambos")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    tipoFilter === "ambos"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Visão Completa</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                      tipoFilter === "ambos" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {stats.ambosCount}/{stats.total}
                  </span>
                </button>
              </div>

              {/* Seletor do Mês */}
              <MonthFilter
                selectedMonth={selectedMonth}
                onChange={(m) => setSelectedMonth(m === "todos" ? currentMonth : m)}
                allowAll={false}
              />
            </div>
          </CardContent>
        </Card>

        {/* 2. Cards de Métricas e Indicadores do Mês */}
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

          {/* Relatórios de Início */}
          <Card
            className={`shadow-sm transition-all cursor-pointer border ${
              tipoFilter === "inicio" ? "ring-2 ring-blue-500/50 bg-blue-500/5 border-blue-400/40" : "hover:border-blue-300"
            }`}
            onClick={() => setTipoFilter("inicio")}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                    Relatórios (Início)
                  </p>
                </div>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 mt-1">
                  {stats.inicioCount}{" "}
                  <span className="text-xs font-normal text-muted-foreground">/ {stats.total}</span>
                </p>
                <p className="text-xs text-blue-600/80 dark:text-blue-400/80 mt-0.5 font-medium">
                  {stats.inicioPercent}% concluídos ({stats.inicioPendentes} pendentes)
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          {/* Verificação de Final */}
          <Card
            className={`shadow-sm transition-all cursor-pointer border ${
              tipoFilter === "final" ? "ring-2 ring-emerald-500/50 bg-emerald-500/5 border-emerald-400/40" : "hover:border-emerald-300"
            }`}
            onClick={() => setTipoFilter("final")}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                    Verificação (Final)
                  </p>
                </div>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                  {stats.finalCount}{" "}
                  <span className="text-xs font-normal text-muted-foreground">/ {stats.total}</span>
                </p>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 font-medium">
                  {stats.finalPercent}% concluídos ({stats.finalPendentes} pendentes)
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          {/* 100% Concluídos no Mês (Ambos) */}
          <Card
            className={`shadow-sm transition-all cursor-pointer border ${
              tipoFilter === "ambos" ? "ring-2 ring-primary/50 bg-primary/5 border-primary/40" : "hover:border-primary/30"
            }`}
            onClick={() => setTipoFilter("ambos")}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">100% Concluídos</p>
                </div>
                <p className="text-2xl font-bold text-primary mt-1">
                  {stats.ambosCount}{" "}
                  <span className="text-xs font-normal text-muted-foreground">/ {stats.total}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                  {stats.ambosPercent}% com Início e Final OK
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 3. Barra de Filtro de Categorias (EU, EU-NOC, IR, REM) */}
        <Card className="mb-4 bg-muted/20 border">
          <CardContent className="p-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {tipoFilter === "inicio"
                    ? "Filtrar por Categoria (Início):"
                    : tipoFilter === "final"
                    ? "Filtrar por Categoria (Final):"
                    : "Filtrar por Categoria (Início ou Final):"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategoryFilter("todas")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                    categoryFilter === "todas"
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-background text-muted-foreground hover:text-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  Todas ({categoryCounts.todas})
                </button>

                {ATENDIMENTO_CATEGORIAS.map((cat) => {
                  const style = CATEGORIA_STYLES[cat];
                  const active = categoryFilter === cat;
                  const count = categoryCounts[cat] || 0;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border flex items-center gap-1.5 ${
                        active ? `${style.pill} border-transparent shadow-xs` : `${style.badge} bg-background/80`
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${active ? "bg-white" : style.dot}`} />
                      <span>{cat}</span>
                      <span className="opacity-80 text-[11px]">({count})</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setCategoryFilter("sem_categoria")}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                    categoryFilter === "sem_categoria"
                      ? "bg-foreground text-background border-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground border-dashed border-border hover:bg-muted/50"
                  }`}
                >
                  Sem categoria ({categoryCounts.sem_categoria})
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Barra de Busca, Filtro de Status e Ações Rápidas */}
        <Card className="mb-4">
          <CardContent className="p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, telefone, documento, ID remoto..."
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
                  Atendidos ({stats.currentAtendidos})
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
                  Pendentes ({stats.currentPendentes})
                </button>
              </div>

              {filteredClientes.length > 0 && (
                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    onClick={handleMarcarTodos}
                    title="Marcar todos visíveis como atendidos"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1 text-primary" />
                    Marcar Todos Sim
                  </Button>
                  {(stats.inicioCount > 0 || stats.finalCount > 0) && (
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

        {/* 5. Tabela Principal de Clientes e Confirmações */}
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="bg-muted/30 border-b py-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Clientes e Confirmação de Atendimentos
              </CardTitle>
              <CardDescription className="text-xs">
                Mês de {formatMonthLabel(selectedMonth)} • {filteredClientes.length} cliente(s) listado(s) •{" "}
                <span className="font-semibold text-foreground">
                  Modo:{" "}
                  {tipoFilter === "inicio"
                    ? "📋 Relatórios de Início do Mês"
                    : tipoFilter === "final"
                    ? "🔍 Verificação de Final de Mês"
                    : "📊 Visão Completa (Início + Final)"}
                </span>
                {categoryFilter !== "todas" && (
                  <span className="font-semibold text-primary">
                    {" "}
                    • Categoria: {categoryFilter === "sem_categoria" ? "Sem Categoria" : categoryFilter}
                  </span>
                )}
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
                    <p className="font-medium">Nenhum cliente encontrado com os filtros selecionados</p>
                    <p className="text-xs mt-1">
                      Tente ajustar o termo de busca, a categoria ({categoryFilter}) ou o filtro de status (
                      {statusFilter}).
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-3 min-w-[200px]">Cliente</th>

                      {/* Header da Categoria independente */}
                      {tipoFilter === "inicio" && (
                        <th className="text-left px-4 py-3 w-36 bg-blue-500/5 text-blue-700 dark:text-blue-400">
                          Cat. Início
                        </th>
                      )}
                      {tipoFilter === "final" && (
                        <th className="text-left px-4 py-3 w-36 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400">
                          Cat. Final
                        </th>
                      )}
                      {tipoFilter === "ambos" && (
                        <th className="text-left px-4 py-3 min-w-[190px]">
                          Categorias (Início / Final)
                        </th>
                      )}

                      <th className="text-left px-4 py-3 min-w-[170px]">ID Acesso Remoto</th>
                      <th className="text-left px-4 py-3 min-w-[160px]">Telefone (WhatsApp)</th>

                      {/* Colunas no Modo "Início" */}
                      {tipoFilter === "inicio" && (
                        <>
                          <th className="text-center px-4 py-3 min-w-[130px] bg-blue-500/5 text-blue-700 dark:text-blue-400">
                            Relatório (Início)?
                          </th>
                          <th className="text-left px-4 py-3">Status Início</th>
                          <th className="text-left px-4 py-3">Observações Início</th>
                          <th className="text-right px-4 py-3">Ação Rápida</th>
                        </>
                      )}

                      {/* Colunas no Modo "Final" */}
                      {tipoFilter === "final" && (
                        <>
                          <th className="text-center px-4 py-3 min-w-[130px] bg-emerald-500/5 text-emerald-700 dark:text-emerald-400">
                            Verificação (Final)?
                          </th>
                          <th className="text-left px-4 py-3">Status Final</th>
                          <th className="text-left px-4 py-3">Observações Final</th>
                          <th className="text-right px-4 py-3">Ação Rápida</th>
                        </>
                      )}

                      {/* Colunas no Modo "Ambos / Visão Completa" */}
                      {tipoFilter === "ambos" && (
                        <>
                          <th className="text-center px-4 py-3 min-w-[170px] bg-blue-500/5 text-blue-700 dark:text-blue-400 border-l">
                            📋 Relatório (Início)
                          </th>
                          <th className="text-center px-4 py-3 min-w-[170px] bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 border-l">
                            🔍 Verificação (Final)
                          </th>
                          <th className="text-center px-4 py-3 min-w-[130px] border-l">Progresso Mês</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredClientes.map((c) => {
                      const itemInicio = atendimentosData.inicio[c.id];
                      const itemFinal = atendimentosData.final[c.id];
                      const isInicioAtendido = !!itemInicio?.atendido;
                      const isFinalAtendido = !!itemFinal?.atendido;

                      const atendidoEmInicio = itemInicio?.atendido_em
                        ? new Date(itemInicio.atendido_em).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : null;

                      const atendidoEmFinal = itemFinal?.atendido_em
                        ? new Date(itemFinal.atendido_em).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : null;

                      const catInicio = clientCategories.inicio[c.id] || "";
                      const catFinal = clientCategories.final[c.id] || "";
                      const remoteId = remoteAccessIds[c.id] || "";

                      return (
                        <tr
                          key={c.id}
                          className={`transition-colors hover:bg-muted/30 ${
                            isInicioAtendido && isFinalAtendido
                              ? "bg-success/[0.03]"
                              : isInicioAtendido || isFinalAtendido
                              ? "bg-primary/[0.02]"
                              : ""
                          }`}
                        >
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

                          {/* Categoria Independente */}
                          {tipoFilter === "inicio" && (
                            <td className="px-4 py-3.5 bg-blue-500/[0.02]">
                              <CategoriaSelector
                                value={catInicio}
                                onChange={(val) =>
                                  setClientCategory.mutate({
                                    clienteId: c.id,
                                    tipo: "inicio",
                                    categoria: val,
                                  })
                                }
                              />
                            </td>
                          )}

                          {tipoFilter === "final" && (
                            <td className="px-4 py-3.5 bg-emerald-500/[0.02]">
                              <CategoriaSelector
                                value={catFinal}
                                onChange={(val) =>
                                  setClientCategory.mutate({
                                    clienteId: c.id,
                                    tipo: "final",
                                    categoria: val,
                                  })
                                }
                              />
                            </td>
                          )}

                          {tipoFilter === "ambos" && (
                            <td className="px-4 py-3.5">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 w-11 shrink-0">
                                    Início:
                                  </span>
                                  <CategoriaSelector
                                    value={catInicio}
                                    onChange={(val) =>
                                      setClientCategory.mutate({
                                        clienteId: c.id,
                                        tipo: "inicio",
                                        categoria: val,
                                      })
                                    }
                                    className="w-[115px] h-7 text-[11px]"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 w-11 shrink-0">
                                    Final:
                                  </span>
                                  <CategoriaSelector
                                    value={catFinal}
                                    onChange={(val) =>
                                      setClientCategory.mutate({
                                        clienteId: c.id,
                                        tipo: "final",
                                        categoria: val,
                                      })
                                    }
                                    className="w-[115px] h-7 text-[11px]"
                                  />
                                </div>
                              </div>
                            </td>
                          )}

                          {/* ID Acesso Remoto */}
                          <td className="px-4 py-3.5">
                            {remoteId ? (
                              <div className="flex items-center gap-1.5 group">
                                <Badge
                                  variant="outline"
                                  className="font-mono text-xs px-2.5 py-1 bg-muted/60 border-primary/30 text-foreground flex items-center gap-1.5 max-w-[170px] hover:bg-muted transition-colors cursor-pointer select-all"
                                  onClick={() => copyToClipboard(remoteId, "ID de Acesso Remoto")}
                                  title="Clique para copiar"
                                >
                                  <Monitor className="h-3 w-3 text-primary shrink-0" />
                                  <span className="truncate font-semibold">{remoteId}</span>
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                                  title="Copiar ID de Acesso Remoto"
                                  onClick={() => copyToClipboard(remoteId, "ID de Acesso Remoto")}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-70 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
                                  title="Editar ID de Acesso Remoto"
                                  onClick={() => {
                                    setRemoteIdModal({ cliente: c, currentId: remoteId });
                                    setRemoteIdText(remoteId);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-dashed text-muted-foreground hover:text-foreground hover:border-primary/50 gap-1 font-normal cursor-pointer"
                                onClick={() => {
                                  setRemoteIdModal({ cliente: c, currentId: "" });
                                  setRemoteIdText("");
                                }}
                              >
                                <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                                + Inserir ID
                              </Button>
                            )}
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

                          {/* VISUALIZAÇÃO MODO INÍCIO */}
                          {tipoFilter === "inicio" && (
                            <>
                              <td className="px-4 py-3.5 text-center bg-blue-500/[0.02]">
                                <div className="flex items-center justify-center gap-2">
                                  <Switch
                                    checked={isInicioAtendido}
                                    onCheckedChange={() => toggleAtendimento(c.id, c.nome, "inicio")}
                                    className="data-[state=checked]:bg-blue-600"
                                  />
                                  <span
                                    className={`text-xs font-bold w-7 text-left ${
                                      isInicioAtendido ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                                    }`}
                                  >
                                    {isInicioAtendido ? "SIM" : "NÃO"}
                                  </span>
                                </div>
                              </td>

                              <td className="px-4 py-3.5">
                                {isInicioAtendido ? (
                                  <div className="space-y-0.5">
                                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-400/30 font-medium gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Relatório Enviado
                                    </Badge>
                                    {atendidoEmInicio && (
                                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {atendidoEmInicio}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground border-dashed gap-1 font-normal">
                                    <XCircle className="h-3 w-3 text-muted-foreground" />
                                    Pendente
                                  </Badge>
                                )}
                              </td>

                              <td className="px-4 py-3.5">
                                {itemInicio?.observacao ? (
                                  <div
                                    onClick={() => {
                                      setObservacaoModal({ cliente: c, tipo: "inicio", item: itemInicio });
                                      setObsText(itemInicio.observacao || "");
                                    }}
                                    className="cursor-pointer group flex items-start gap-1.5 text-xs text-muted-foreground hover:text-foreground max-w-xs"
                                    title="Clique para editar nota de relatório"
                                  >
                                    <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500 mt-0.5" />
                                    <span className="truncate group-hover:underline">{itemInicio.observacao}</span>
                                  </div>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                                    onClick={() => {
                                      setObservacaoModal({ cliente: c, tipo: "inicio", item: itemInicio });
                                      setObsText("");
                                    }}
                                  >
                                    <FileText className="h-3.5 w-3.5 mr-1" />
                                    + Nota
                                  </Button>
                                )}
                              </td>

                              <td className="px-4 py-3.5 text-right">
                                <Button
                                  size="sm"
                                  variant={isInicioAtendido ? "outline" : "default"}
                                  className={`h-8 text-xs font-semibold ${
                                    isInicioAtendido
                                      ? "text-blue-600 border-blue-400/30 hover:bg-blue-50"
                                      : "bg-blue-600 hover:bg-blue-700 text-white"
                                  }`}
                                  onClick={() => toggleAtendimento(c.id, c.nome, "inicio")}
                                >
                                  {isInicioAtendido ? (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                      Relatório OK
                                    </>
                                  ) : (
                                    <>
                                      <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                                      Confirmar Início
                                    </>
                                  )}
                                </Button>
                              </td>
                            </>
                          )}

                          {/* VISUALIZAÇÃO MODO FINAL */}
                          {tipoFilter === "final" && (
                            <>
                              <td className="px-4 py-3.5 text-center bg-emerald-500/[0.02]">
                                <div className="flex items-center justify-center gap-2">
                                  <Switch
                                    checked={isFinalAtendido}
                                    onCheckedChange={() => toggleAtendimento(c.id, c.nome, "final")}
                                    className="data-[state=checked]:bg-emerald-600"
                                  />
                                  <span
                                    className={`text-xs font-bold w-7 text-left ${
                                      isFinalAtendido ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                                    }`}
                                  >
                                    {isFinalAtendido ? "SIM" : "NÃO"}
                                  </span>
                                </div>
                              </td>

                              <td className="px-4 py-3.5">
                                {isFinalAtendido ? (
                                  <div className="space-y-0.5">
                                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-400/30 font-medium gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Verificado
                                    </Badge>
                                    {atendidoEmFinal && (
                                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {atendidoEmFinal}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground border-dashed gap-1 font-normal">
                                    <XCircle className="h-3 w-3 text-muted-foreground" />
                                    Pendente
                                  </Badge>
                                )}
                              </td>

                              <td className="px-4 py-3.5">
                                {itemFinal?.observacao ? (
                                  <div
                                    onClick={() => {
                                      setObservacaoModal({ cliente: c, tipo: "final", item: itemFinal });
                                      setObsText(itemFinal.observacao || "");
                                    }}
                                    className="cursor-pointer group flex items-start gap-1.5 text-xs text-muted-foreground hover:text-foreground max-w-xs"
                                    title="Clique para editar nota de verificação final"
                                  >
                                    <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
                                    <span className="truncate group-hover:underline">{itemFinal.observacao}</span>
                                  </div>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                                    onClick={() => {
                                      setObservacaoModal({ cliente: c, tipo: "final", item: itemFinal });
                                      setObsText("");
                                    }}
                                  >
                                    <FileText className="h-3.5 w-3.5 mr-1" />
                                    + Nota
                                  </Button>
                                )}
                              </td>

                              <td className="px-4 py-3.5 text-right">
                                <Button
                                  size="sm"
                                  variant={isFinalAtendido ? "outline" : "default"}
                                  className={`h-8 text-xs font-semibold ${
                                    isFinalAtendido
                                      ? "text-emerald-600 border-emerald-400/30 hover:bg-emerald-50"
                                      : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                  }`}
                                  onClick={() => toggleAtendimento(c.id, c.nome, "final")}
                                >
                                  {isFinalAtendido ? (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                      Verificado OK
                                    </>
                                  ) : (
                                    <>
                                      <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                                      Confirmar Final
                                    </>
                                  )}
                                </Button>
                              </td>
                            </>
                          )}

                          {/* VISUALIZAÇÃO MODO AMBOS / VISÃO COMPLETA */}
                          {tipoFilter === "ambos" && (
                            <>
                              {/* Coluna Início */}
                              <td className="px-4 py-3 text-center bg-blue-500/[0.02] border-l">
                                <div className="flex flex-col items-center gap-1.5">
                                  <div className="flex items-center justify-center gap-2">
                                    <Switch
                                      checked={isInicioAtendido}
                                      onCheckedChange={() => toggleAtendimento(c.id, c.nome, "inicio")}
                                      className="data-[state=checked]:bg-blue-600"
                                    />
                                    <span
                                      className={`text-xs font-bold w-7 text-left ${
                                        isInicioAtendido ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                                      }`}
                                    >
                                      {isInicioAtendido ? "SIM" : "NÃO"}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    {atendidoEmInicio ? (
                                      <span className="text-[10px] text-muted-foreground">{atendidoEmInicio}</span>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground/60 italic">Não enviado</span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setObservacaoModal({ cliente: c, tipo: "inicio", item: itemInicio });
                                        setObsText(itemInicio?.observacao || "");
                                      }}
                                      className={`p-1 rounded hover:bg-muted transition-colors ${
                                        itemInicio?.observacao ? "text-blue-600 font-bold" : "text-muted-foreground/60"
                                      }`}
                                      title={itemInicio?.observacao || "Adicionar nota de Início"}
                                    >
                                      <FileText className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              </td>

                              {/* Coluna Final */}
                              <td className="px-4 py-3 text-center bg-emerald-500/[0.02] border-l">
                                <div className="flex flex-col items-center gap-1.5">
                                  <div className="flex items-center justify-center gap-2">
                                    <Switch
                                      checked={isFinalAtendido}
                                      onCheckedChange={() => toggleAtendimento(c.id, c.nome, "final")}
                                      className="data-[state=checked]:bg-emerald-600"
                                    />
                                    <span
                                      className={`text-xs font-bold w-7 text-left ${
                                        isFinalAtendido ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                                      }`}
                                    >
                                      {isFinalAtendido ? "SIM" : "NÃO"}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    {atendidoEmFinal ? (
                                      <span className="text-[10px] text-muted-foreground">{atendidoEmFinal}</span>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground/60 italic">Não verificado</span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setObservacaoModal({ cliente: c, tipo: "final", item: itemFinal });
                                        setObsText(itemFinal?.observacao || "");
                                      }}
                                      className={`p-1 rounded hover:bg-muted transition-colors ${
                                        itemFinal?.observacao ? "text-emerald-600 font-bold" : "text-muted-foreground/60"
                                      }`}
                                      title={itemFinal?.observacao || "Adicionar nota de Final"}
                                    >
                                      <FileText className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              </td>

                              {/* Progresso Geral */}
                              <td className="px-4 py-3.5 text-center border-l">
                                {isInicioAtendido && isFinalAtendido ? (
                                  <Badge className="bg-success text-success-foreground font-semibold text-xs gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    100% OK (2/2)
                                  </Badge>
                                ) : isInicioAtendido || isFinalAtendido ? (
                                  <Badge variant="outline" className="text-amber-600 border-amber-400/50 bg-amber-500/10 font-medium text-xs gap-1">
                                    <Clock className="h-3 w-3" />
                                    Parcial (1/2)
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground border-dashed text-xs gap-1 font-normal">
                                    <XCircle className="h-3 w-3 text-muted-foreground" />
                                    Pendente (0/2)
                                  </Badge>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal para anotação/observação específica (Início ou Final) */}
        <Dialog open={!!observacaoModal} onOpenChange={(open) => !open && setObservacaoModal(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                {observacaoModal?.tipo === "inicio" ? (
                  <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                ) : (
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                )}
                Nota:{" "}
                {observacaoModal?.tipo === "inicio"
                  ? "Relatório de Início do Mês"
                  : "Verificação de Final de Mês"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="text-xs text-muted-foreground flex flex-col gap-0.5">
                <div>
                  Cliente: <strong className="text-foreground">{observacaoModal?.cliente.nome}</strong>
                </div>
                <div>
                  Mês de referência: <strong className="text-foreground">{formatMonthLabel(selectedMonth)}</strong>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="obs-text" className="text-xs font-semibold">
                  Observações sobre este atendimento
                </Label>
                <Textarea
                  id="obs-text"
                  placeholder={
                    observacaoModal?.tipo === "inicio"
                      ? "Ex: Relatório mensal de faturamento enviado por e-mail, cliente confirmou recebimento..."
                      : "Ex: Verificação de backup concluída, suporte de encerramento mensal realizado com sucesso..."
                  }
                  rows={4}
                  value={obsText}
                  onChange={(e) => setObsText(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setObservacaoModal(null)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSaveObservacao}
                className={
                  observacaoModal?.tipo === "inicio"
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                }
              >
                Salvar Nota
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal para inserir / editar ID de Acesso Remoto */}
        <Dialog open={!!remoteIdModal} onOpenChange={(open) => !open && setRemoteIdModal(null)}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Monitor className="h-5 w-5 text-primary" />
                ID de Acesso Remoto: {remoteIdModal?.cliente.nome}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">
                Cadastre o ID do software de acesso remoto (AnyDesk, TeamViewer, RustDesk, Supremo, etc.) deste cliente para acesso rápido sempre que precisar.
              </p>

              <div className="space-y-2">
                <Label htmlFor="remote-id-input" className="text-xs font-semibold">
                  ID / Código de Acesso
                </Label>
                <div className="relative">
                  <Input
                    id="remote-id-input"
                    placeholder="Ex: 123 456 789 ou AnyDesk: 987654321"
                    value={remoteIdText}
                    onChange={(e) => setRemoteIdText(e.target.value)}
                    className="font-mono text-sm pr-9"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveRemoteId();
                      }
                    }}
                  />
                  {remoteIdText && (
                    <button
                      type="button"
                      onClick={() => setRemoteIdText("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Sugestões rápidas de prefixo / tipo */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">Adicionar prefixo rápido:</span>
                <div className="flex flex-wrap gap-1.5">
                  {["AnyDesk: ", "TeamViewer: ", "RustDesk: ", "Supremo: "].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        if (!remoteIdText.startsWith(tag)) {
                          setRemoteIdText(tag + remoteIdText.replace(/^(AnyDesk|TeamViewer|RustDesk|Supremo):\s*/i, ""));
                        }
                      }}
                      className="text-[11px] px-2 py-0.5 rounded bg-muted hover:bg-primary/15 hover:text-primary transition-colors border text-muted-foreground cursor-pointer"
                    >
                      +{tag.trim()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 flex flex-row items-center justify-between">
              <div>
                {remoteIdModal?.currentId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-1.5 cursor-pointer"
                    onClick={() => {
                      if (confirm(`Deseja remover o ID de acesso remoto de ${remoteIdModal.cliente.nome}?`)) {
                        setRemoteAccessId.mutate({ clienteId: remoteIdModal.cliente.id, remoteId: null });
                        setRemoteIdModal(null);
                        setRemoteIdText("");
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover ID
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="outline" onClick={() => setRemoteIdModal(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveRemoteId} disabled={setRemoteAccessId.isPending}>
                  Salvar ID
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
