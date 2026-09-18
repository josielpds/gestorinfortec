import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { currentUserId } from "@/hooks/useCurrentUser";
import {
  Building2,
  User,
  Calculator,
  Save,
  RotateCcw,
  Sparkles,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Sliders,
  DollarSign,
  Calendar,
  Layers,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/faturamento-fiscal")({
  head: () => ({
    meta: [
      { title: "Faturamento Fiscal — CobraZap" },
      {
        name: "description",
        content: "Controle e acompanhamento de faturamento fiscal anual para Conta CNPJ e Conta CPF com limites.",
      },
    ],
  }),
  component: FaturamentoFiscalPage,
});

const MONTHS = [
  { key: "jan", label: "JAN", full: "Janeiro", num: "01" },
  { key: "fev", label: "FEV", full: "Fevereiro", num: "02" },
  { key: "mar", label: "MAR", full: "Março", num: "03" },
  { key: "abr", label: "ABR", full: "Abril", num: "04" },
  { key: "mai", label: "MAI", full: "Maio", num: "05" },
  { key: "jun", label: "JUN", full: "Junho", num: "06" },
  { key: "jul", label: "JUL", full: "Julho", num: "07" },
  { key: "ago", label: "AGO", full: "Agosto", num: "08" },
  { key: "set", label: "SET", full: "Setembro", num: "09" },
  { key: "out", label: "OUT", full: "Outubro", num: "10" },
  { key: "nov", label: "NOV", full: "Novembro", num: "11" },
  { key: "dez", label: "DEZ", full: "Dezembro", num: "12" },
] as const;

type MonthKey = (typeof MONTHS)[number]["key"];

type MonthlyValues = Record<MonthKey, number>;

const defaultMonthlyValues = (): MonthlyValues => ({
  jan: 0,
  fev: 0,
  mar: 0,
  abr: 0,
  mai: 0,
  jun: 0,
  jul: 0,
  ago: 0,
  set: 0,
  out: 0,
  nov: 0,
  dez: 0,
});

interface FiscalYearData {
  cnpj: MonthlyValues;
  cpf: MonthlyValues;
  limiteCnpj?: number;
  limiteCpf?: number;
}

const DEFAULT_LIMITE_CNPJ = 81000;
const DEFAULT_LIMITE_CPF = 60000;

function parseBRLInput(value: string): number {
  if (!value) return 0;
  // Remove currency symbol, spaces, points for thousands and convert comma to dot
  const clean = value
    .replace(/[^\d,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function formatInputValue(num: number): string {
  if (num === 0) return "";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function FaturamentoFiscalPage() {
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState<number>(currentYear);
  const [limiteCnpj, setLimiteCnpj] = useState<number>(DEFAULT_LIMITE_CNPJ);
  const [limiteCpf, setLimiteCpf] = useState<number>(DEFAULT_LIMITE_CPF);
  const [cnpjValues, setCnpjValues] = useState<MonthlyValues>(defaultMonthlyValues());
  const [cpfValues, setCpfValues] = useState<MonthlyValues>(defaultMonthlyValues());
  const [limitesModalOpen, setLimitesModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [tempLimiteCnpj, setTempLimiteCnpj] = useState(String(DEFAULT_LIMITE_CNPJ));
  const [tempLimiteCpf, setTempLimiteCpf] = useState(String(DEFAULT_LIMITE_CPF));

  // Fetch fiscal settings from Supabase
  const configKey = `faturamento_fiscal_${ano}`;
  const { data: savedConfig, isLoading } = useQuery({
    queryKey: ["configuracao", configKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("value")
        .eq("key", configKey)
        .maybeSingle();

      if (error) throw error;
      if (!data?.value) return null;
      try {
        return JSON.parse(data.value) as FiscalYearData;
      } catch {
        return null;
      }
    },
  });

  // Also query movimentacoes for the auto-import feature
  const { data: movimentacoesEntradas = [] } = useQuery({
    queryKey: ["movimentacoes_entradas_ano", ano],
    queryFn: async () => {
      const startOfYear = `${ano}-01-01`;
      const endOfYear = `${ano}-12-31`;
      const { data, error } = await supabase
        .from("movimentacoes")
        .select("valor, data, tipo, status, categoria")
        .eq("tipo", "entrada")
        .gte("data", startOfYear)
        .lte("data", endOfYear);

      if (error) throw error;
      return data || [];
    },
  });

  // Sync state when data is loaded or year changes
  useEffect(() => {
    if (savedConfig) {
      setCnpjValues({ ...defaultMonthlyValues(), ...(savedConfig.cnpj || {}) });
      setCpfValues({ ...defaultMonthlyValues(), ...(savedConfig.cpf || {}) });
      setLimiteCnpj(savedConfig.limiteCnpj ?? DEFAULT_LIMITE_CNPJ);
      setLimiteCpf(savedConfig.limiteCpf ?? DEFAULT_LIMITE_CPF);
    } else {
      setCnpjValues(defaultMonthlyValues());
      setCpfValues(defaultMonthlyValues());
      setLimiteCnpj(DEFAULT_LIMITE_CNPJ);
      setLimiteCpf(DEFAULT_LIMITE_CPF);
    }
  }, [savedConfig, ano]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (customData?: Partial<FiscalYearData>) => {
      const user_id = await currentUserId();
      const payload: FiscalYearData = {
        cnpj: customData?.cnpj ?? cnpjValues,
        cpf: customData?.cpf ?? cpfValues,
        limiteCnpj: customData?.limiteCnpj ?? limiteCnpj,
        limiteCpf: customData?.limiteCpf ?? limiteCpf,
      };

      const { error } = await supabase.from("configuracoes").upsert(
        {
          user_id,
          key: configKey,
          value: JSON.stringify(payload),
        },
        { onConflict: "user_id,key" }
      );

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Faturamento fiscal de ${ano} salvo com sucesso!`);
      qc.invalidateQueries({ queryKey: ["configuracao", configKey] });
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar: " + err.message);
    },
  });

  // Calculations
  const totalCnpj = useMemo(() => {
    return Object.values(cnpjValues).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [cnpjValues]);

  const totalCpf = useMemo(() => {
    return Object.values(cpfValues).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [cpfValues]);

  const totalGeral = totalCnpj + totalCpf;

  const pctCnpj = limiteCnpj > 0 ? (totalCnpj / limiteCnpj) * 100 : 0;
  const pctCpf = limiteCpf > 0 ? (totalCpf / limiteCpf) * 100 : 0;

  const saldoCnpj = limiteCnpj - totalCnpj;
  const saldoCpf = limiteCpf - totalCpf;

  const mediaMensal = totalGeral / 12;

  // Chart data
  const chartData = useMemo(() => {
    return MONTHS.map((m) => {
      const valCnpj = cnpjValues[m.key] || 0;
      const valCpf = cpfValues[m.key] || 0;
      return {
        mes: m.label,
        CNPJ: valCnpj,
        CPF: valCpf,
        Total: valCnpj + valCpf,
      };
    });
  }, [cnpjValues, cpfValues]);

  // Handler for month input change
  const handleCnpjChange = (month: MonthKey, valueStr: string) => {
    const num = parseBRLInput(valueStr);
    setCnpjValues((prev) => ({ ...prev, [month]: num }));
  };

  const handleCpfChange = (month: MonthKey, valueStr: string) => {
    const num = parseBRLInput(valueStr);
    setCpfValues((prev) => ({ ...prev, [month]: num }));
  };

  // Auto-import from Movimentações
  const handleImportMovimentacoes = (target: "cnpj" | "cpf" | "ambos") => {
    const monthlySum: Record<MonthKey, number> = defaultMonthlyValues();

    movimentacoesEntradas.forEach((mov) => {
      if (!mov.data) return;
      const monthIndex = parseInt(mov.data.substring(5, 7), 10) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        const monthKey = MONTHS[monthIndex].key;
        monthlySum[monthKey] += Number(mov.valor) || 0;
      }
    });

    if (target === "cnpj") {
      setCnpjValues(monthlySum);
      toast.success("Entradas do sistema importadas para a Conta CNPJ!");
    } else if (target === "cpf") {
      setCpfValues(monthlySum);
      toast.success("Entradas do sistema importadas para a Conta CPF!");
    } else {
      setCnpjValues(monthlySum);
      toast.success("Entradas importadas com sucesso!");
    }
    setImportModalOpen(false);
  };

  const handleSaveLimites = () => {
    const numCnpj = parseBRLInput(tempLimiteCnpj);
    const numCpf = parseBRLInput(tempLimiteCpf);
    setLimiteCnpj(numCnpj || DEFAULT_LIMITE_CNPJ);
    setLimiteCpf(numCpf || DEFAULT_LIMITE_CPF);
    setLimitesModalOpen(false);
    saveMutation.mutate({
      limiteCnpj: numCnpj || DEFAULT_LIMITE_CNPJ,
      limiteCpf: numCpf || DEFAULT_LIMITE_CPF,
    });
  };

  const openLimitesModal = () => {
    setTempLimiteCnpj(String(limiteCnpj));
    setTempLimiteCpf(String(limiteCpf));
    setLimitesModalOpen(true);
  };

  const handleExportCSV = () => {
    let csv = `FATURAMENTO FISCAL - ANO ${ano}\n\n`;
    csv += `CONTA;` + MONTHS.map((m) => m.label).join(";") + `;TOTAL ANUAL;LIMITE ANUAL;SALDO RESTANTE\n`;
    csv += `CONTA CNPJ;` + MONTHS.map((m) => cnpjValues[m.key].toFixed(2)).join(";") + `;${totalCnpj.toFixed(2)};${limiteCnpj.toFixed(2)};${saldoCnpj.toFixed(2)}\n`;
    csv += `CONTA CPF;` + MONTHS.map((m) => cpfValues[m.key].toFixed(2)).join(";") + `;${totalCpf.toFixed(2)};${limiteCpf.toFixed(2)};${saldoCpf.toFixed(2)}\n`;
    csv += `TOTAL GERAL;` + MONTHS.map((m) => ((cnpjValues[m.key] || 0) + (cpfValues[m.key] || 0)).toFixed(2)).join(";") + `;${totalGeral.toFixed(2)};-;-\n`;

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `faturamento_fiscal_${ano}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Arquivo CSV exportado com sucesso!");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto print:p-0 print:max-w-none">
        {/* Header with year controls and action buttons */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/50 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <Calculator className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                  Faturamento Fiscal
                </h1>
                <p className="text-sm text-muted-foreground">
                  Controle mensal de entradas das contas CNPJ e CPF com limites anuais
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Year Selector */}
            <div className="flex items-center bg-card border rounded-lg p-1 shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setAno((a) => a - 1)}
                title="Ano anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="px-3 py-1 font-bold text-base tracking-wide flex items-center gap-1.5 min-w-[76px] justify-center">
                <Calendar className="h-4 w-4 text-amber-500" />
                {ano}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setAno((a) => a + 1)}
                title="Próximo ano"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={openLimitesModal}
              className="gap-1.5 shadow-sm text-xs sm:text-sm"
              title="Ajustar limites anuais"
            >
              <Sliders className="h-4 w-4 text-muted-foreground" />
              Limites
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportModalOpen(true)}
              className="gap-1.5 shadow-sm text-xs sm:text-sm"
              title="Puxar valores das movimentações do sistema"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              Importar Entradas
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="gap-1.5 shadow-sm text-xs sm:text-sm print:hidden"
              title="Exportar dados para Excel / CSV"
            >
              <Download className="h-4 w-4 text-muted-foreground" />
              CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 shadow-sm text-xs sm:text-sm print:hidden"
              title="Imprimir relatório"
            >
              <Printer className="h-4 w-4 text-muted-foreground" />
              Imprimir
            </Button>

            <Button
              onClick={() => saveMutation.mutate({})}
              disabled={saveMutation.isPending}
              size="sm"
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold shadow-sm text-xs sm:text-sm"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card CNPJ */}
          <Card className="border-border/60 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-500" />
            <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
                  <Building2 className="h-4 w-4 text-amber-500" />
                  CONTA CNPJ (MEI / Empresa)
                </CardTitle>
                <div className="text-2xl font-bold text-foreground">
                  {brl(totalCnpj)}
                </div>
              </div>
              <div
                className={`px-2 py-1 rounded-md text-xs font-bold ${
                  totalCnpj > limiteCnpj
                    ? "bg-red-500/15 text-red-600 dark:text-red-400"
                    : pctCnpj > 80
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {pctCnpj.toFixed(1)}% do Limite
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-1 pb-4">
              <Progress
                value={Math.min(pctCnpj, 100)}
                className={`h-2 ${totalCnpj > limiteCnpj ? "[&>div]:bg-red-500" : pctCnpj > 80 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}`}
              />
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>Limite: <strong className="text-foreground">{brl(limiteCnpj)}</strong></span>
                <span>
                  Saldo:{" "}
                  <strong className={saldoCnpj < 0 ? "text-red-500 font-bold" : "text-emerald-600 dark:text-emerald-400"}>
                    {brl(saldoCnpj)}
                  </strong>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Card CPF */}
          <Card className="border-border/60 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-sky-500" />
            <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
                  <User className="h-4 w-4 text-sky-500" />
                  CONTA CPF (Pessoa Física)
                </CardTitle>
                <div className="text-2xl font-bold text-foreground">
                  {brl(totalCpf)}
                </div>
              </div>
              <div
                className={`px-2 py-1 rounded-md text-xs font-bold ${
                  totalCpf > limiteCpf
                    ? "bg-red-500/15 text-red-600 dark:text-red-400"
                    : pctCpf > 80
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                }`}
              >
                {pctCpf.toFixed(1)}% do Limite
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-1 pb-4">
              <Progress
                value={Math.min(pctCpf, 100)}
                className={`h-2 ${totalCpf > limiteCpf ? "[&>div]:bg-red-500" : pctCpf > 80 ? "[&>div]:bg-amber-500" : "[&>div]:bg-sky-500"}`}
              />
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>Limite: <strong className="text-foreground">{brl(limiteCpf)}</strong></span>
                <span>
                  Saldo:{" "}
                  <strong className={saldoCpf < 0 ? "text-red-500 font-bold" : "text-sky-600 dark:text-sky-400"}>
                    {brl(saldoCpf)}
                  </strong>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Card Consolidado */}
          <Card className="border-border/60 shadow-sm relative overflow-hidden bg-gradient-to-br from-card to-muted/30">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary" />
            <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
                  <Layers className="h-4 w-4 text-primary" />
                  TOTAL CONSOLIDADO (CNPJ + CPF)
                </CardTitle>
                <div className="text-2xl font-bold text-primary">
                  {brl(totalGeral)}
                </div>
              </div>
              <div className="px-2 py-1 rounded-md text-xs font-semibold bg-primary/10 text-primary">
                Ano {ano}
              </div>
            </CardHeader>
            <CardContent className="space-y-1 pt-1 pb-4 text-xs text-muted-foreground">
              <div className="flex justify-between py-0.5">
                <span>Média Mensal:</span>
                <strong className="text-foreground">{brl(mediaMensal)}</strong>
              </div>
              <div className="flex justify-between py-0.5">
                <span>Total Entradas no Ano:</span>
                <strong className="text-foreground">{brl(totalGeral)}</strong>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notification banner if limit exceeded */}
        {(totalCnpj > limiteCnpj || totalCpf > limiteCpf) && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3.5 flex items-start gap-3 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-red-600" />
            <div>
              <strong className="font-semibold">Atenção ao Limite Fiscal:</strong>{" "}
              {totalCnpj > limiteCnpj && (
                <span>O faturamento da Conta CNPJ ultrapassou o limite anual estipulado em {brl(totalCnpj - limiteCnpj)}. </span>
              )}
              {totalCpf > limiteCpf && (
                <span>O faturamento da Conta CPF ultrapassou o limite anual estipulado em {brl(totalCpf - limiteCpf)}. </span>
              )}
              Consulte seu contador para verificar a necessidade de desenquadramento ou declaração complementar.
            </div>
          </div>
        )}

        {/* 1. MODELO EXCEL: CONTA CNPJ TABLE */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border shadow-sm overflow-hidden bg-card">
            {/* Golden Excel Banner */}
            <div className="bg-[#f59e0b] dark:bg-[#d97706] text-zinc-950 font-bold px-4 py-2.5 text-center text-sm md:text-base uppercase tracking-wide border-b border-amber-600/30 flex items-center justify-between">
              <span className="flex-1 text-center font-extrabold tracking-wider">
                CONTA CNPJ - ENTRADAS - FISCAL - LIMITE ANUAL {brl(limiteCnpj)}
              </span>
            </div>

            {/* Excel Grid Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-zinc-300 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-b border-border">
                    {MONTHS.map((m) => (
                      <th
                        key={m.key}
                        className="py-2.5 px-2 font-bold text-center border-r border-border/60 last:border-r-0 min-w-[70px]"
                      >
                        {m.label}
                      </th>
                    ))}
                    <th className="py-2.5 px-4 font-extrabold text-center bg-zinc-400/70 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 min-w-[130px]">
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-background hover:bg-muted/10 transition-colors">
                    {MONTHS.map((m) => (
                      <td
                        key={m.key}
                        className="p-1 border-r border-border/60 last:border-r-0 align-middle"
                      >
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formatInputValue(cnpjValues[m.key])}
                          onChange={(e) => handleCnpjChange(m.key, e.target.value)}
                          placeholder="0,00"
                          className="w-full text-right px-2 py-2 font-medium bg-transparent rounded border border-transparent hover:border-border focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none transition-all text-xs sm:text-sm"
                        />
                      </td>
                    ))}
                    <td className="p-2 font-black text-right bg-zinc-200/60 dark:bg-zinc-800/80 text-foreground align-middle text-sm sm:text-base border-l border-border">
                      <div className="flex items-center justify-between gap-1 px-1">
                        <span className="text-xs font-semibold text-muted-foreground">R$</span>
                        <span className="font-extrabold text-foreground">
                          {totalCnpj.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 2. MODELO EXCEL: CONTA CPF TABLE */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border shadow-sm overflow-hidden bg-card">
            {/* Golden Excel Banner */}
            <div className="bg-[#f59e0b] dark:bg-[#d97706] text-zinc-950 font-bold px-4 py-2.5 text-center text-sm md:text-base uppercase tracking-wide border-b border-amber-600/30 flex items-center justify-between">
              <span className="flex-1 text-center font-extrabold tracking-wider">
                CONTA CPF - ENTRADAS - FISCAL - LIMITE ANUAL {brl(limiteCpf)}
              </span>
            </div>

            {/* Excel Grid Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-zinc-300 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-b border-border">
                    {MONTHS.map((m) => (
                      <th
                        key={m.key}
                        className="py-2.5 px-2 font-bold text-center border-r border-border/60 last:border-r-0 min-w-[70px]"
                      >
                        {m.label}
                      </th>
                    ))}
                    <th className="py-2.5 px-4 font-extrabold text-center bg-zinc-400/70 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 min-w-[130px]">
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-background hover:bg-muted/10 transition-colors">
                    {MONTHS.map((m) => (
                      <td
                        key={m.key}
                        className="p-1 border-r border-border/60 last:border-r-0 align-middle"
                      >
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formatInputValue(cpfValues[m.key])}
                          onChange={(e) => handleCpfChange(m.key, e.target.value)}
                          placeholder="0,00"
                          className="w-full text-right px-2 py-2 font-medium bg-transparent rounded border border-transparent hover:border-border focus:border-sky-500 focus:bg-sky-50/10 focus:outline-none transition-all text-xs sm:text-sm"
                        />
                      </td>
                    ))}
                    <td className="p-2 font-black text-right bg-zinc-200/60 dark:bg-zinc-800/80 text-foreground align-middle text-sm sm:text-base border-l border-border">
                      <div className="flex items-center justify-between gap-1 px-1">
                        <span className="text-xs font-semibold text-muted-foreground">R$</span>
                        <span className="font-extrabold text-foreground">
                          {totalCpf.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 3. TABELA CONSOLIDADA (CNPJ + CPF SOMADOS MÊS A MÊS) */}
        <div className="rounded-xl border border-border/80 shadow-sm overflow-hidden bg-card">
          <div className="bg-muted/70 px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-primary" />
              Consolidado Mensal (Total CNPJ + CPF por Mês)
            </span>
            <span className="text-foreground font-bold">Total Geral do Ano: {brl(totalGeral)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground border-b border-border text-center">
                  {MONTHS.map((m) => (
                    <th key={m.key} className="py-2 px-2 font-semibold border-r border-border/40">
                      {m.label}
                    </th>
                  ))}
                  <th className="py-2 px-3 font-extrabold bg-primary/10 text-primary">TOTAL GERAL</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-center font-bold">
                  {MONTHS.map((m) => {
                    const mesTotal = (cnpjValues[m.key] || 0) + (cpfValues[m.key] || 0);
                    return (
                      <td key={m.key} className="py-2.5 px-2 border-r border-border/40 text-right">
                        {mesTotal > 0 ? (
                          <span className="text-foreground font-semibold">
                            {mesTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 font-normal">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-right bg-primary/15 text-primary font-black text-sm sm:text-base border-l border-primary/20">
                    {brl(totalGeral)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. COMPARATIVE CHART */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-500" />
              Evolução Mensal do Faturamento ({ano})
            </CardTitle>
            <CardDescription>
              Comparativo visual das entradas da Conta CNPJ e Conta CPF mês a mês
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                    tickLine={false}
                    axisLine={false}
                    width={65}
                  />
                  <Tooltip
                    formatter={(value: any) => [brl(Number(value)), ""]}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="CNPJ" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Conta CNPJ" />
                  <Bar dataKey="CPF" fill="#0284c7" radius={[4, 4, 0, 0]} name="Conta CPF" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* 5. QUICK ACTIONS & HINTS FOOTER */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border/70 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>Os valores preenchidos são salvos e sincronizados com sua conta na nuvem.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setCnpjValues(defaultMonthlyValues());
                setCpfValues(defaultMonthlyValues());
                toast.info("Campos resetados para zero.");
              }}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Limpar Valores
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold"
              onClick={() => saveMutation.mutate({})}
              disabled={saveMutation.isPending}
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              Salvar Alterações
            </Button>
          </div>
        </div>

        {/* MODAL: AJUSTAR LIMITES FISCAIS */}
        <Dialog open={limitesModalOpen} onOpenChange={setLimitesModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-amber-500" />
                Configurar Limites Anuais ({ano})
              </DialogTitle>
              <DialogDescription>
                Ajuste os valores máximos de faturamento anual para alerta e cálculo de saldo.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="limiteCnpj" className="flex items-center gap-1.5 font-semibold">
                  <Building2 className="h-4 w-4 text-amber-500" />
                  Limite Anual Conta CNPJ (R$)
                </Label>
                <Input
                  id="limiteCnpj"
                  type="text"
                  value={tempLimiteCnpj}
                  onChange={(e) => setTempLimiteCnpj(e.target.value)}
                  placeholder="81.000,00"
                />
                <p className="text-[11px] text-muted-foreground">
                  Padrão MEI: R$ 81.000,00 anuais (R$ 6.750,00/mês).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="limiteCpf" className="flex items-center gap-1.5 font-semibold">
                  <User className="h-4 w-4 text-sky-500" />
                  Limite Anual Conta CPF (R$)
                </Label>
                <Input
                  id="limiteCpf"
                  type="text"
                  value={tempLimiteCpf}
                  onChange={(e) => setTempLimiteCpf(e.target.value)}
                  placeholder="60.000,00"
                />
                <p className="text-[11px] text-muted-foreground">
                  Limite ou teto estipulado para movimentações em Pessoa Física.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLimitesModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSaveLimites}
                className="bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold"
              >
                Salvar Limites
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL: IMPORTAR ENTRADAS DO SISTEMA */}
        <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                Importar Entradas do Sistema ({ano})
              </DialogTitle>
              <DialogDescription>
                Você possui {movimentacoesEntradas.length} entrada(s) registradas no ano de {ano} no módulo de Entradas e Saídas.
              </DialogDescription>
            </DialogHeader>
            <div className="py-3 text-sm space-y-3">
              <p className="text-muted-foreground">
                Deseja importar a soma das entradas cadastradas no sistema diretamente para qual conta?
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                <Button
                  variant="outline"
                  className="justify-start h-auto py-3 border-amber-500/40 hover:bg-amber-500/10 text-left"
                  onClick={() => handleImportMovimentacoes("cnpj")}
                >
                  <Building2 className="h-5 w-5 text-amber-500 mr-3 shrink-0" />
                  <div>
                    <div className="font-bold text-foreground">Importar para Conta CNPJ</div>
                    <div className="text-xs text-muted-foreground">
                      Preenche a tabela CNPJ com a soma das entradas de cada mês de {ano}
                    </div>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-3 border-sky-500/40 hover:bg-sky-500/10 text-left"
                  onClick={() => handleImportMovimentacoes("cpf")}
                >
                  <User className="h-5 w-5 text-sky-500 mr-3 shrink-0" />
                  <div>
                    <div className="font-bold text-foreground">Importar para Conta CPF</div>
                    <div className="text-xs text-muted-foreground">
                      Preenche a tabela CPF com a soma das entradas de cada mês de {ano}
                    </div>
                  </div>
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setImportModalOpen(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
