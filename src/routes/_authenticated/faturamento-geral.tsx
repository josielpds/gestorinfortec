import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { currentUserId } from "@/hooks/useCurrentUser";
import {
  TrendingUp,
  TrendingDown,
  Save,
  RotateCcw,
  Sparkles,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Layers,
  DollarSign,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  CheckCircle2,
  CalendarRange,
  Wallet,
  MinusCircle,
  Percent,
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
  Line,
  ComposedChart,
  LabelList,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/faturamento-geral")({
  head: () => ({
    meta: [
      { title: "Faturamento Geral — Gestor Financeiro Infortec" },
      {
        name: "description",
        content: "Resumo geral de faturamento mês a mês e evolução anual consolidada.",
      },
    ],
  }),
  component: FaturamentoGeralPage,
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

const HISTORICO_FATURAMENTO_BASE: Record<number, number> = {
  2021: 64721.95,
  2022: 76731.63,
  2023: 91452.43,
  2024: 101147.25,
  2025: 103699.35,
};

/**
 * Valores manuais fixos de Janeiro a Julho de 2026 (período informado de histórico):
 * JAN: R$ 8.498,19 | FEV: R$ 9.323,98 | MAR: R$ 10.011,19 | ABR: R$ 9.864,88
 * MAI: R$ 9.525,19 | JUN: R$ 9.477,19 | JUL: R$ 10.193,19
 */
const VALORES_BASE_2026_MANUAL: MonthlyValues = {
  jan: 8498.19,
  fev: 9323.98,
  mar: 10011.19,
  abr: 9864.88,
  mai: 9525.19,
  jun: 9477.19,
  jul: 10193.19,
  ago: 0,
  set: 0,
  out: 0,
  nov: 0,
  dez: 0,
};

/**
 * Regra de automação e bloqueio de inclusão manual:
 * - Anos posteriores a 2026 (2027, 2028, etc.): 100% dos meses (JAN a DEZ) sincronizados automaticamente e bloqueados para edição manual.
 * - Ano de 2026: Meses de AGO a DEZ sincronizados automaticamente com os dados do sistema e bloqueados para edição manual (JAN a JUL com os valores manuais informados).
 * - Anos anteriores ou iguais a 2025: Históricos consolidados.
 */
export function isMonthAutoLocked(year: number, monthKey: MonthKey): boolean {
  if (year > 2026) return true;
  if (year === 2026) {
    return ["ago", "set", "out", "nov", "dez"].includes(monthKey);
  }
  return false;
}

interface FaturamentoGeralData {
  manualValues?: MonthlyValues;
  cobrancasValues?: MonthlyValues;
  movimentacoesValues?: MonthlyValues;
  mode?: "automatic" | "manual";
}

function parseBRLInput(value: string): number {
  if (!value) return 0;
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

function FaturamentoGeralPage() {
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState<number>(currentYear);
  const [isManualEdit, setIsManualEdit] = useState<boolean>(false);
  const [customValues, setCustomValues] = useState<MonthlyValues>(defaultMonthlyValues());

  // 1. Fetch saved configuration / custom entries for selected year
  const configKey = `faturamento_geral_${ano}`;
  const { data: savedConfig } = useQuery({
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
        return JSON.parse(data.value) as FaturamentoGeralData;
      } catch {
        return null;
      }
    },
  });

  // 1.1 Fetch all saved faturamento_geral configurations for all years
  const { data: allSavedConfigs = [] } = useQuery({
    queryKey: ["todas_configuracoes_faturamento_geral"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("key, value")
        .like("key", "faturamento_geral_%");

      if (error) throw error;
      return data || [];
    },
  });

  const mapSavedConfigs = useMemo(() => {
    const map: Record<number, MonthlyValues> = {};
    allSavedConfigs.forEach((item) => {
      try {
        const yStr = item.key.replace("faturamento_geral_", "");
        const yNum = parseInt(yStr, 10);
        if (yNum) {
          const parsed = JSON.parse(item.value) as FaturamentoGeralData;
          if (parsed.manualValues) {
            map[yNum] = parsed.manualValues;
          }
        }
      } catch {
        // ignore
      }
    });
    return map;
  }, [allSavedConfigs]);

  // 2. Query all cobrancas paid for the selected year and surrounding years
  const { data: cobrancasData = [] } = useQuery({
    queryKey: ["cobrancas_faturamento_geral"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cobrancas")
        .select("id, valor, status, vencimento, data_pagamento, created_at")
        .eq("status", "pago");

      if (error) throw error;
      return data || [];
    },
  });

  // 3. Query all movimentacoes de entrada (paid / received)
  const { data: movimentacoesData = [] } = useQuery({
    queryKey: ["movimentacoes_faturamento_geral"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes")
        .select("id, valor, tipo, status, data, cobranca_id")
        .eq("tipo", "entrada")
        .is("cobranca_id", null);

      if (error) throw error;
      return (data || []).filter((m) => !m.status || m.status === "pago" || m.status === "recebido");
    },
  });

  // 3.1 Query all contas_pagar (paid expenses)
  const { data: contasPagarData = [] } = useQuery({
    queryKey: ["contas_pagar_faturamento_geral"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar")
        .select("id, valor, status, vencimento, pago_em, created_at, categoria");

      if (error) throw error;
      return data || [];
    },
  });

  // 3.2 Query all movimentacoes de saida (standalone manual paid expenses)
  const { data: movimentacoesSaidaData = [] } = useQuery({
    queryKey: ["movimentacoes_saida_faturamento_geral"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes")
        .select("id, valor, tipo, status, data, conta_pagar_id, categoria")
        .eq("tipo", "saida")
        .is("conta_pagar_id", null);

      if (error) throw error;
      return (data || []).filter((m) => !m.status || m.status === "pago");
    },
  });

  // 4. Calculate actual system monthly revenue values for current selected year
  const { cobrancasMes, movimentacoesMes, totalMesSistema } = useMemo(() => {
    const cobMap = defaultMonthlyValues();
    const movMap = defaultMonthlyValues();
    const totMap = defaultMonthlyValues();

    // Process cobranças
    cobrancasData.forEach((c) => {
      const dateStr = c.data_pagamento || c.vencimento || c.created_at;
      if (!dateStr) return;
      const cYear = parseInt(dateStr.substring(0, 4), 10);
      if (cYear === ano) {
        const monthIdx = parseInt(dateStr.substring(5, 7), 10) - 1;
        if (monthIdx >= 0 && monthIdx < 12) {
          const key = MONTHS[monthIdx].key;
          const val = Number(c.valor) || 0;
          cobMap[key] += val;
          totMap[key] += val;
        }
      }
    });

    // Process movimentações avulsas de entrada
    movimentacoesData.forEach((m) => {
      if (!m.data) return;
      const mYear = parseInt(m.data.substring(0, 4), 10);
      if (mYear === ano) {
        const monthIdx = parseInt(m.data.substring(5, 7), 10) - 1;
        if (monthIdx >= 0 && monthIdx < 12) {
          const key = MONTHS[monthIdx].key;
          const val = Number(m.valor) || 0;
          movMap[key] += val;
          totMap[key] += val;
        }
      }
    });

    // Se for ano histórico anterior a 2025 e não houver lançamentos no banco de dados para esse ano,
    // distribui o valor histórico igualmente nos 12 meses como sugestão inicial
    const baseHist = HISTORICO_FATURAMENTO_BASE[ano];
    const systemTotal = Object.values(totMap).reduce((a, b) => a + b, 0);
    if (ano < 2025 && systemTotal === 0 && baseHist !== undefined) {
      const perMonth = Math.round((baseHist / 12) * 100) / 100;
      let remainder = baseHist;
      MONTHS.forEach((m, idx) => {
        if (idx === 11) {
          totMap[m.key] = Math.round(remainder * 100) / 100;
          cobMap[m.key] = Math.round(remainder * 100) / 100;
        } else {
          totMap[m.key] = perMonth;
          cobMap[m.key] = perMonth;
          remainder -= perMonth;
        }
      });
    }

    return {
      cobrancasMes: cobMap,
      movimentacoesMes: movMap,
      totalMesSistema: totMap,
    };
  }, [cobrancasData, movimentacoesData, ano]);

  // 4.1 Calculate monthly expenses (Contas a Pagar pagas + Saídas Avulsas) for current selected year
  const { despesasContasMes, despesasSaidasMes, totalDespesasMes } = useMemo(() => {
    const cpMap = defaultMonthlyValues();
    const movMap = defaultMonthlyValues();
    const totMap = defaultMonthlyValues();

    // Contas a pagar quitadas/pagas
    contasPagarData.forEach((cp) => {
      if (cp.status !== "pago") return;
      const dateStr = cp.pago_em || cp.vencimento || cp.created_at;
      if (!dateStr) return;
      const cpYear = parseInt(dateStr.substring(0, 4), 10);
      if (cpYear === ano) {
        const monthIdx = parseInt(dateStr.substring(5, 7), 10) - 1;
        if (monthIdx >= 0 && monthIdx < 12) {
          const key = MONTHS[monthIdx].key;
          const val = Number(cp.valor) || 0;
          cpMap[key] += val;
          totMap[key] += val;
        }
      }
    });

    // Saídas avulsas manuais pagas
    movimentacoesSaidaData.forEach((m) => {
      if (!m.data) return;
      const mYear = parseInt(m.data.substring(0, 4), 10);
      if (mYear === ano) {
        const monthIdx = parseInt(m.data.substring(5, 7), 10) - 1;
        if (monthIdx >= 0 && monthIdx < 12) {
          const key = MONTHS[monthIdx].key;
          const val = Number(m.valor) || 0;
          movMap[key] += val;
          totMap[key] += val;
        }
      }
    });

    return {
      despesasContasMes: cpMap,
      despesasSaidasMes: movMap,
      totalDespesasMes: totMap,
    };
  }, [contasPagarData, movimentacoesSaidaData, ano]);

  // Sync custom values when config loads or year changes
  useEffect(() => {
    if (savedConfig?.manualValues) {
      const merged = { ...totalMesSistema, ...savedConfig.manualValues };
      if (ano === 2026) {
        MONTHS.forEach((m) => {
          if (!isMonthAutoLocked(2026, m.key) && (merged[m.key] === undefined || merged[m.key] === 0)) {
            merged[m.key] = VALORES_BASE_2026_MANUAL[m.key] || 0;
          }
        });
      }
      // Garantir que meses travados (automáticos) recebam os dados do sistema
      MONTHS.forEach((m) => {
        if (isMonthAutoLocked(ano, m.key)) {
          merged[m.key] = totalMesSistema[m.key];
        }
      });
      setCustomValues(merged);
      setIsManualEdit(ano <= 2026 && savedConfig.mode === "manual");
    } else {
      if (ano === 2026) {
        const initial2026 = { ...totalMesSistema, ...VALORES_BASE_2026_MANUAL };
        MONTHS.forEach((m) => {
          if (isMonthAutoLocked(2026, m.key)) {
            initial2026[m.key] = totalMesSistema[m.key];
          }
        });
        setCustomValues(initial2026);
      } else {
        setCustomValues(totalMesSistema);
      }
    }
  }, [savedConfig, ano, totalMesSistema]);

  // Values currently active for gross revenue calculations & table
  const activeMonthlyValues = useMemo(() => {
    const result = defaultMonthlyValues();
    MONTHS.forEach((m) => {
      if (isMonthAutoLocked(ano, m.key)) {
        // Meses de AGO a DEZ em 2026 e todos os meses em anos seguintes: sempre dados reais do sistema
        result[m.key] = totalMesSistema[m.key] || 0;
      } else {
        // Meses manuais/históricos (ex: JAN a JUL 2026 ou anos anteriores)
        const base2026 = ano === 2026 ? VALORES_BASE_2026_MANUAL[m.key] : undefined;
        result[m.key] = isManualEdit
          ? (customValues[m.key] ?? base2026 ?? totalMesSistema[m.key] ?? 0)
          : (savedConfig?.manualValues?.[m.key] ?? customValues[m.key] ?? base2026 ?? totalMesSistema[m.key] ?? 0);
      }
    });
    return result;
  }, [ano, isManualEdit, customValues, totalMesSistema, savedConfig]);

  // Save custom values mutation (usado para meses manuais de anos passados e Jan-Jul 2026)
  const saveMutation = useMutation({
    mutationFn: async (modeToSave: "automatic" | "manual" = isManualEdit ? "manual" : "automatic") => {
      const user_id = await currentUserId();
      const payload: FaturamentoGeralData = {
        manualValues: activeMonthlyValues,
        cobrancasValues: cobrancasMes,
        movimentacoesValues: movimentacoesMes,
        mode: modeToSave,
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
      toast.success(`Faturamento geral de ${ano} salvo com sucesso!`);
      qc.invalidateQueries({ queryKey: ["configuracao", configKey] });
      qc.invalidateQueries({ queryKey: ["todas_configuracoes_faturamento_geral"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar: " + err.message);
    },
  });

  // Calculate annual totals and metrics (Bruto, Despesas e Líquido)
  const totalAno = useMemo(() => {
    return Object.values(activeMonthlyValues).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [activeMonthlyValues]);

  const totalCobrancasAno = useMemo(() => {
    return Object.values(cobrancasMes).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [cobrancasMes]);

  const totalMovimentacoesAno = useMemo(() => {
    return Object.values(movimentacoesMes).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [movimentacoesMes]);

  const totalContasPagarAno = useMemo(() => {
    return Object.values(despesasContasMes).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [despesasContasMes]);

  const totalSaidasAvulsasAno = useMemo(() => {
    return Object.values(despesasSaidasMes).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [despesasSaidasMes]);

  const totalDespesasAno = useMemo(() => {
    return Object.values(totalDespesasMes).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [totalDespesasMes]);

  // Faturamento Líquido mês a mês (Bruto - Despesas)
  const faturamentoLiquidoMes = useMemo(() => {
    const res = defaultMonthlyValues();
    MONTHS.forEach((m) => {
      const bruto = activeMonthlyValues[m.key] || 0;
      const despesa = totalDespesasMes[m.key] || 0;
      res[m.key] = bruto - despesa;
    });
    return res;
  }, [activeMonthlyValues, totalDespesasMes]);

  const totalLiquidoAno = useMemo(() => {
    return totalAno - totalDespesasAno;
  }, [totalAno, totalDespesasAno]);

  const margemLiquidaAno = useMemo(() => {
    return totalAno > 0 ? (totalLiquidoAno / totalAno) * 100 : 0;
  }, [totalAno, totalLiquidoAno]);

  // Best month & monthly average
  const { melhorMes, mediaMensal, melhorMesLiquido, mediaMensalLiquida } = useMemo(() => {
    let maxVal = -1;
    let maxMonth = "—";
    let minVal = Infinity;
    let minMonth = "—";
    let monthsWithData = 0;

    let maxLiqVal = -Infinity;
    let maxLiqMonth = "—";

    MONTHS.forEach((m) => {
      const v = activeMonthlyValues[m.key] || 0;
      const liq = faturamentoLiquidoMes[m.key] || 0;

      if (v > maxVal) {
        maxVal = v;
        maxMonth = m.full;
      }
      if (v > 0 && v < minVal) {
        minVal = v;
        minMonth = m.full;
      }
      if (v > 0) monthsWithData++;

      if (liq > maxLiqVal && v > 0) {
        maxLiqVal = liq;
        maxLiqMonth = m.full;
      }
    });

    const avg = totalAno / 12;
    const avgLiq = totalLiquidoAno / 12;

    return {
      melhorMes: { nome: maxVal > 0 ? maxMonth : "—", valor: maxVal > 0 ? maxVal : 0 },
      menorMes: { nome: minVal < Infinity ? minMonth : "—", valor: minVal < Infinity ? minVal : 0 },
      mediaMensal: avg,
      melhorMesLiquido: { nome: maxLiqVal > -Infinity ? maxLiqMonth : "—", valor: maxLiqVal > -Infinity ? maxLiqVal : 0 },
      mediaMensalLiquida: avgLiq,
      monthsWithData,
    };
  }, [activeMonthlyValues, faturamentoLiquidoMes, totalAno, totalLiquidoAno]);

  // 5. Multi-year data calculation for the Year-Over-Year Evolution Chart
  const anosDisponiveis = useMemo(() => {
    const yearSet = new Set<number>([2021, 2022, 2023, 2024, 2025, currentYear, ano]);

    // Anos presentes nas configurações salvas
    allSavedConfigs.forEach((item) => {
      const yStr = item.key.replace("faturamento_geral_", "");
      const yNum = parseInt(yStr, 10);
      if (yNum && yNum > 2000 && yNum < 2100) yearSet.add(yNum);
    });

    cobrancasData.forEach((c) => {
      const d = c.data_pagamento || c.vencimento || c.created_at;
      if (d) {
        const y = parseInt(d.substring(0, 4), 10);
        if (y > 2000 && y < 2100) yearSet.add(y);
      }
    });

    movimentacoesData.forEach((m) => {
      if (m.data) {
        const y = parseInt(m.data.substring(0, 4), 10);
        if (y > 2000 && y < 2100) yearSet.add(y);
      }
    });

    contasPagarData.forEach((cp) => {
      const d = cp.pago_em || cp.vencimento || cp.created_at;
      if (d) {
        const y = parseInt(d.substring(0, 4), 10);
        if (y > 2000 && y < 2100) yearSet.add(y);
      }
    });

    movimentacoesSaidaData.forEach((m) => {
      if (m.data) {
        const y = parseInt(m.data.substring(0, 4), 10);
        if (y > 2000 && y < 2100) yearSet.add(y);
      }
    });

    return Array.from(yearSet).sort((a, b) => a - b);
  }, [cobrancasData, movimentacoesData, contasPagarData, movimentacoesSaidaData, allSavedConfigs, currentYear, ano]);

  // Year-over-year revenue comparison array (alimentado dinamicamente pelos dados preenchidos / salvos / sistema)
  const dadosEvolucaoAnual = useMemo(() => {
    const result = anosDisponiveis.map((y) => {
      let totCob = 0;
      let totMov = 0;
      let totDespCP = 0;
      let totDespMov = 0;
      const monthCobMap: Record<number, number> = {};
      const monthMovMap: Record<number, number> = {};

      cobrancasData.forEach((c) => {
        const d = c.data_pagamento || c.vencimento || c.created_at;
        if (d && parseInt(d.substring(0, 4), 10) === y) {
          const val = Number(c.valor) || 0;
          totCob += val;
          const mIdx = parseInt(d.substring(5, 7), 10) - 1;
          monthCobMap[mIdx] = (monthCobMap[mIdx] || 0) + val;
        }
      });

      movimentacoesData.forEach((m) => {
        if (m.data && parseInt(m.data.substring(0, 4), 10) === y) {
          const val = Number(m.valor) || 0;
          totMov += val;
          const mIdx = parseInt(m.data.substring(5, 7), 10) - 1;
          monthMovMap[mIdx] = (monthMovMap[mIdx] || 0) + val;
        }
      });

      contasPagarData.forEach((cp) => {
        if (cp.status !== "pago") return;
        const d = cp.pago_em || cp.vencimento || cp.created_at;
        if (d && parseInt(d.substring(0, 4), 10) === y) {
          totDespCP += Number(cp.valor) || 0;
        }
      });

      movimentacoesSaidaData.forEach((m) => {
        if (m.data && parseInt(m.data.substring(0, 4), 10) === y) {
          totDespMov += Number(m.valor) || 0;
        }
      });

      const totalSistema = totCob + totMov;
      const baseHistorica = HISTORICO_FATURAMENTO_BASE[y];
      const savedForYear = mapSavedConfigs[y];

      let finalTotal = totalSistema;
      let finalCob = totCob;
      let finalMov = totMov;

      // 1. Se for o ano atualmente selecionado, usa o valor ativo calculado em tempo real
      if (y === ano) {
        finalTotal = totalAno;
        finalCob = totalCobrancasAno > 0 ? totalCobrancasAno : totalAno;
        finalMov = totalMovimentacoesAno;
      }
      // 2. Anos > 2026 (2027, 2028, etc.): 100% dados reais do sistema
      else if (y > 2026) {
        finalTotal = totalSistema;
        finalCob = totCob;
        finalMov = totMov;
      }
      // 3. Ano 2026: JAN a JUL de configuração salva (ou histórico base manual) + AGO a DEZ do sistema
      else if (y === 2026) {
        let sum2026 = 0;
        let sumCob2026 = 0;
        let sumMov2026 = 0;

        MONTHS.forEach((m, idx) => {
          if (isMonthAutoLocked(2026, m.key)) {
            // AGO a DEZ: sistema
            const sysM = (monthCobMap[idx] || 0) + (monthMovMap[idx] || 0);
            sum2026 += sysM;
            sumCob2026 += monthCobMap[idx] || 0;
            sumMov2026 += monthMovMap[idx] || 0;
          } else {
            // JAN a JUL: valor salvo ou valor da base manual informada
            const manualVal = savedForYear?.[m.key] ?? VALORES_BASE_2026_MANUAL[m.key];
            if (manualVal !== undefined) {
              sum2026 += Number(manualVal) || 0;
              sumCob2026 += Number(manualVal) || 0;
            } else {
              const sysM = (monthCobMap[idx] || 0) + (monthMovMap[idx] || 0);
              sum2026 += sysM;
              sumCob2026 += monthCobMap[idx] || 0;
              sumMov2026 += monthMovMap[idx] || 0;
            }
          }
        });

        finalTotal = sum2026;
        finalCob = sumCob2026;
        finalMov = sumMov2026;
      }
      // 4. Anos anteriores ou iguais a 2025 (<= 2025): valores salvos ou históricos
      else {
        if (savedForYear) {
          const sumManual = Object.values(savedForYear).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
          if (sumManual > 0) {
            finalTotal = sumManual;
            finalCob = sumManual;
            finalMov = 0;
          } else if (baseHistorica !== undefined) {
            finalTotal = baseHistorica;
            finalCob = baseHistorica;
            finalMov = 0;
          }
        } else if (baseHistorica !== undefined) {
          finalTotal = baseHistorica;
          finalCob = baseHistorica;
          finalMov = 0;
        } else {
          finalTotal = totalSistema;
          finalCob = totCob;
          finalMov = totMov;
        }
      }

      const finalDespesas = y === ano ? totalDespesasAno : (totDespCP + totDespMov);
      const finalLiquido = finalTotal - finalDespesas;
      const finalMargem = finalTotal > 0 ? (finalLiquido / finalTotal) * 100 : 0;

      return {
        ano: String(y),
        anoNum: y,
        Cobranças: finalCob,
        "Outras Entradas": finalMov,
        Total: finalTotal,
        Despesas: finalDespesas,
        Liquido: finalLiquido,
        Margem: finalMargem,
      };
    });

    // Adicionar percentuais de crescimento ano a ano
    return result.map((item, idx) => {
      const prev = idx > 0 ? result[idx - 1].Total : 0;
      const crescimento = prev > 0 ? ((item.Total - prev) / prev) * 100 : 0;
      return {
        ...item,
        crescimento,
        crescimentoLabel: prev > 0 ? `${crescimento >= 0 ? "+" : ""}${crescimento.toFixed(1)}%` : "—",
      };
    });
  }, [
    anosDisponiveis,
    cobrancasData,
    movimentacoesData,
    contasPagarData,
    movimentacoesSaidaData,
    ano,
    totalAno,
    totalCobrancasAno,
    totalMovimentacoesAno,
    totalDespesasAno,
    mapSavedConfigs,
  ]);

  // Previous year total for comparison card
  const totalAnoAnterior = useMemo(() => {
    const prevYearItem = dadosEvolucaoAnual.find((d) => d.anoNum === ano - 1);
    return prevYearItem?.Total ?? 0;
  }, [dadosEvolucaoAnual, ano]);

  const crescimentoAnoAnterior = useMemo(() => {
    if (totalAnoAnterior === 0) return null;
    return ((totalAno - totalAnoAnterior) / totalAnoAnterior) * 100;
  }, [totalAno, totalAnoAnterior]);

  // Chart data for monthly view of the selected year
  const dadosGraficoMensal = useMemo(() => {
    return MONTHS.map((m) => {
      const valTotal = activeMonthlyValues[m.key] || 0;
      const valCob = cobrancasMes[m.key] || 0;
      const valMov = movimentacoesMes[m.key] || 0;
      const valDesp = totalDespesasMes[m.key] || 0;
      const valLiq = faturamentoLiquidoMes[m.key] || 0;

      return {
        mes: m.label,
        mesCompleto: m.full,
        Total: valTotal,
        Cobranças: valCob,
        "Outras Entradas": valMov,
        Despesas: valDesp,
        "Faturamento Líquido": valLiq,
        media: mediaMensal,
      };
    });
  }, [activeMonthlyValues, cobrancasMes, movimentacoesMes, totalDespesasMes, faturamentoLiquidoMes, mediaMensal]);

  // Handlers for manual table changes
  const handleCellChange = (month: MonthKey, valueStr: string) => {
    if (isMonthAutoLocked(ano, month)) {
      toast.info(`O faturamento de ${month.toUpperCase()} em ${ano} é sincronizado automaticamente pelo sistema.`);
      return;
    }
    const num = parseBRLInput(valueStr);
    setIsManualEdit(true);
    setCustomValues((prev) => ({ ...prev, [month]: num }));
  };

  const handleResetToSystem = () => {
    setCustomValues(totalMesSistema);
    setIsManualEdit(false);
    toast.info("Valores recalculados automaticamente com base no banco de dados.");
  };

  // Export CSV
  const handleExportCSV = () => {
    let csv = `FATURAMENTO GERAL E LÍQUIDO - ANO ${ano}\n\n`;
    csv += `MÊS;FATURAMENTO BRUTO;COBRANÇAS PAGAS;OUTRAS ENTRADAS;DESPESAS TOTAIS;FATURAMENTO LÍQUIDO;MARGEM (%);TIPO\n`;
    MONTHS.forEach((m) => {
      const cob = cobrancasMes[m.key] || 0;
      const mov = movimentacoesMes[m.key] || 0;
      const tot = activeMonthlyValues[m.key] || 0;
      const desp = totalDespesasMes[m.key] || 0;
      const liq = faturamentoLiquidoMes[m.key] || 0;
      const margem = tot > 0 ? ((liq / tot) * 100).toFixed(1) : "0.0";
      const isAuto = isMonthAutoLocked(ano, m.key);
      csv += `${m.full.toUpperCase()};${tot.toFixed(2)};${cob.toFixed(2)};${mov.toFixed(2)};${desp.toFixed(2)};${liq.toFixed(2)};${margem}%;${isAuto ? "AUTOMÁTICO" : "MANUAL"}\n`;
    });
    const margemGeral = totalAno > 0 ? ((totalLiquidoAno / totalAno) * 100).toFixed(1) : "0.0";
    csv += `TOTAL ANO;${totalAno.toFixed(2)};${totalCobrancasAno.toFixed(2)};${totalMovimentacoesAno.toFixed(2)};${totalDespesasAno.toFixed(2)};${totalLiquidoAno.toFixed(2)};${margemGeral}%;-\n\n`;

    csv += `EVOLUÇÃO HISTÓRICA ANO A ANO\n`;
    csv += `ANO;FATURAMENTO BRUTO;DESPESAS;FATURAMENTO LÍQUIDO;MARGEM (%);CRESCIMENTO BRUTO (%)\n`;
    dadosEvolucaoAnual.forEach((d) => {
      csv += `${d.ano};${d.Total.toFixed(2)};${d.Despesas.toFixed(2)};${d.Liquido.toFixed(2)};${d.Margem.toFixed(1)}%;${d.crescimentoLabel}\n`;
    });

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `faturamento_geral_e_liquido_${ano}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Arquivo CSV exportado com sucesso!");
  };

  const handlePrint = () => {
    window.print();
  };

  const isAllMonthsAuto = ano > 2026;
  const isPartiallyAuto = ano === 2026;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto print:p-0 print:max-w-none">
        {/* Header with year controls and action buttons */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/50 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold shadow-xs">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                  Faturamento Geral
                </h1>
                <p className="text-sm text-muted-foreground">
                  Resumo de todos os recebimentos mês a mês, faturamento líquido após despesas e evolução consolidada
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
              <div className="px-3 py-1 font-bold text-base tracking-wide flex items-center gap-1.5 min-w-[80px] justify-center text-sky-600 dark:text-sky-400">
                <Calendar className="h-4 w-4" />
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

            {/* Quick Year Jump */}
            <select
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className="h-9 px-2.5 text-xs font-semibold bg-card border border-border rounded-lg shadow-xs text-foreground focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
            >
              {anosDisponiveis.map((y) => (
                <option key={y} value={y}>
                  Ano {y}
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleResetToSystem}
              className="gap-1.5 shadow-sm text-xs sm:text-sm"
              title="Recalcular com as entradas, cobranças e despesas do banco de dados"
            >
              <Sparkles className="h-4 w-4 text-sky-500" />
              Sincronizar
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

            {!isAllMonthsAuto && (
              <Button
                onClick={() => saveMutation.mutate(isManualEdit ? "manual" : "automatic")}
                disabled={saveMutation.isPending}
                size="sm"
                className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-sm text-xs sm:text-sm"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            )}
          </div>
        </div>

        {/* Top Summary KPI Cards (Bruto, Despesas e Líquido) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Total Faturado Bruto */}
          <Card className="border-border/60 shadow-sm relative overflow-hidden bg-card">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-sky-500" />
            <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-sky-500" />
                Faturamento Bruto ({ano})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 pb-4">
              <div className="text-2xl font-extrabold text-foreground">
                {brl(totalAno)}
              </div>
              <div className="flex items-center gap-1 text-xs pt-1 text-muted-foreground">
                {crescimentoAnoAnterior !== null ? (
                  <span
                    className={`font-bold flex items-center gap-0.5 ${
                      crescimentoAnoAnterior >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-500"
                    }`}
                  >
                    {crescimentoAnoAnterior >= 0 ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    {Math.abs(crescimentoAnoAnterior).toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sem dados anteriores</span>
                )}
                <span className="text-muted-foreground/80">vs ano anterior</span>
              </div>
            </CardContent>
          </Card>

          {/* Total de Despesas */}
          <Card className="border-border/60 shadow-sm relative overflow-hidden bg-card">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-500" />
            <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MinusCircle className="h-4 w-4 text-rose-500" />
                Total Despesas ({ano})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 pb-4">
              <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
                {brl(totalDespesasAno)}
              </div>
              <div className="text-xs text-muted-foreground pt-1">
                {totalAno > 0 ? (
                  <span>
                    Representa <strong className="text-rose-600 dark:text-rose-400">{((totalDespesasAno / totalAno) * 100).toFixed(1)}%</strong> do faturamento
                  </span>
                ) : (
                  <span>Contas e saídas quitadas</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Faturamento Líquido (Destaque Principal) */}
          <Card className="border-emerald-500/30 shadow-sm relative overflow-hidden bg-emerald-500/5 dark:bg-emerald-950/20">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />
            <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-emerald-500" />
                Faturamento Líquido ({ano})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 pb-4">
              <div className={`text-2xl font-black ${totalLiquidoAno >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                {brl(totalLiquidoAno)}
              </div>
              <div className="flex items-center gap-1.5 text-xs pt-1">
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-bold text-[11px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  <Percent className="h-3 w-3" />
                  {margemLiquidaAno.toFixed(1)}% margem
                </span>
                <span className="text-muted-foreground text-[11px]">após despesas</span>
              </div>
            </CardContent>
          </Card>

          {/* Média Mensal Líquida */}
          <Card className="border-border/60 shadow-sm relative overflow-hidden bg-card">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-500" />
            <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CalendarRange className="h-4 w-4 text-indigo-500" />
                Média Líquida/Mês
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 pb-4">
              <div className="text-2xl font-extrabold text-foreground">
                {brl(mediaMensalLiquida)}
              </div>
              <div className="text-xs text-muted-foreground pt-1">
                Bruta: <strong className="text-foreground">{brl(mediaMensal)}</strong>/mês
              </div>
            </CardContent>
          </Card>

          {/* Origem dos Recebimentos */}
          <Card className="border-border/60 shadow-sm relative overflow-hidden bg-card">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-500" />
            <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Receipt className="h-4 w-4 text-amber-500" />
                Origem das Receitas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 pb-4 text-xs">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-muted-foreground">Cobranças:</span>
                <strong className="text-foreground font-semibold">{brl(totalCobrancasAno)}</strong>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-muted-foreground">Entradas Avulsas:</span>
                <strong className="text-foreground font-semibold">{brl(totalMovimentacoesAno)}</strong>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── TABELA 1 ESTILO PLANILHA: RESUMO GERAL DE FATURAMENTO (BRUTO) ─── */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border shadow-sm overflow-hidden bg-card">
            {/* Vivid Blue / Cyan Top Banner matching model image */}
            <div className="bg-[#00a2e8] text-zinc-950 dark:text-white dark:bg-[#0284c7] font-extrabold px-4 py-3 text-center text-sm sm:text-base md:text-lg uppercase tracking-wider border-b border-sky-600/30 flex items-center justify-between shadow-xs">
              <span className="flex-1 text-center font-black tracking-widest drop-shadow-xs">
                RESUMO GERAL DE FATURAMENTO
              </span>
            </div>

            {/* Excel Grid Table matching model image */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm border-collapse min-w-[960px]">
                <thead>
                  <tr className="bg-zinc-300 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-b border-border">
                    {MONTHS.map((m) => {
                      const isLocked = isMonthAutoLocked(ano, m.key);
                      return (
                        <th
                          key={m.key}
                          className={`py-2 px-2 font-bold text-center border-r border-border/70 last:border-r-0 min-w-[70px] tracking-wider ${
                            isLocked ? "bg-sky-100/60 dark:bg-sky-950/40 text-sky-950 dark:text-sky-200" : ""
                          }`}
                        >
                          <div className="flex flex-col items-center">
                            <span>{m.label}</span>
                            {isLocked && (
                              <span className="text-[9px] font-bold text-sky-600 dark:text-sky-400 tracking-tight uppercase">
                                Auto
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    <th className="py-2.5 px-4 font-black text-center bg-zinc-400/80 dark:bg-zinc-700 text-zinc-950 dark:text-zinc-100 min-w-[140px] tracking-wider">
                      TOTAL ANO
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Linha Principal de Faturamento Geral */}
                  <tr className="bg-background hover:bg-muted/15 transition-colors">
                    {MONTHS.map((m) => {
                      const isLocked = isMonthAutoLocked(ano, m.key);
                      const val = activeMonthlyValues[m.key] || 0;
                      return (
                        <td
                          key={m.key}
                          className={`p-1 border-r border-border/70 last:border-r-0 align-middle text-right ${
                            isLocked ? "bg-sky-50/25 dark:bg-sky-950/20" : ""
                          }`}
                        >
                          {isLocked ? (
                            <div
                              className="px-2 py-2.5 text-right font-extrabold text-foreground text-xs sm:text-sm select-none"
                              title={`Sincronizado automaticamente com os dados do sistema (${m.full}/${ano})`}
                            >
                              {val > 0
                                ? val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : "0,00"}
                            </div>
                          ) : (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={formatInputValue(val)}
                              onChange={(e) => handleCellChange(m.key, e.target.value)}
                              placeholder="0,00"
                              title={`Editar valor manual de ${m.full}/${ano}`}
                              className="w-full text-right px-2 py-2.5 font-bold text-foreground bg-transparent rounded border border-dashed border-amber-300 dark:border-amber-700 hover:border-sky-500 focus:border-sky-500 focus:bg-sky-50/10 focus:outline-none transition-all text-xs sm:text-sm"
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="p-2 font-black text-right bg-zinc-200/80 dark:bg-zinc-800 text-foreground align-middle text-sm sm:text-base border-l border-border">
                      <div className="flex items-center justify-between gap-1 px-1">
                        <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">R$</span>
                        <span className="font-extrabold text-foreground">
                          {totalAno.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Linhas de Detalhamento Complementar */}
                  <tr className="bg-muted/20 text-xs text-muted-foreground border-t border-border/60">
                    <td colSpan={12} className="px-3 py-1.5 font-medium italic">
                      Detalhamento do Sistema ({ano}): Cobranças Pagas: {brl(totalCobrancasAno)} | Outras Entradas: {brl(totalMovimentacoesAno)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold text-foreground bg-muted/40">
                      Total Bruto: {brl(totalAno)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-muted-foreground px-1 gap-2">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              {isAllMonthsAuto ? (
                <span className="text-sky-700 dark:text-sky-300 font-medium">
                  Ano {ano}: 100% sincronizado automaticamente com os dados do sistema (inclusão manual desativada).
                </span>
              ) : isPartiallyAuto ? (
                <span>
                  Ano 2026: Meses de <strong className="text-foreground">AGO a DEZ</strong> são sincronizados automaticamente com o sistema (sem inclusão manual). Meses de <strong className="text-foreground">JAN a JUL</strong> possuem os valores informados de histórico.
                </span>
              ) : isManualEdit ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Modo de edição manual ativo. Clique em "Salvar" para gravar ou "Sincronizar" para recarregar do banco.
                </span>
              ) : (
                <span>Valores consolidados no histórico do sistema para o ano de {ano}.</span>
              )}
            </span>
            <span>Ano selecionado: <strong>{ano}</strong></span>
          </div>
        </div>

        {/* ─── TABELA 2 ESTILO PLANILHA: RESUMO GERAL DE FATURAMENTO LÍQUIDO (ABAIXO DO RESUMO GERAL) ─── */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border shadow-sm overflow-hidden bg-card">
            {/* Emerald Green Top Banner for Liquid Revenue */}
            <div className="bg-[#059669] text-white dark:bg-[#047857] font-extrabold px-4 py-3 text-center text-sm sm:text-base md:text-lg uppercase tracking-wider border-b border-emerald-600/30 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-emerald-200" />
              </div>
              <span className="flex-1 text-center font-black tracking-widest drop-shadow-xs">
                RESUMO GERAL DE FATURAMENTO LÍQUIDO
              </span>
              <div className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-800/60 text-emerald-100 hidden sm:block">
                Após Despesas
              </div>
            </div>

            {/* Excel Grid Table matching model image */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm border-collapse min-w-[960px]">
                <thead>
                  <tr className="bg-emerald-900/15 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-b border-border">
                    {MONTHS.map((m) => (
                      <th
                        key={m.key}
                        className="py-2 px-2 font-bold text-center border-r border-border/70 last:border-r-0 min-w-[70px] tracking-wider"
                      >
                        <div className="flex flex-col items-center">
                          <span>{m.label}</span>
                          <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 tracking-tight">
                            Líquido
                          </span>
                        </div>
                      </th>
                    ))}
                    <th className="py-2.5 px-4 font-black text-center bg-emerald-600 text-white dark:bg-emerald-700 min-w-[140px] tracking-wider">
                      TOTAL LÍQUIDO
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Linha 1: Faturamento Líquido (Resultado Principal) */}
                  <tr className="bg-emerald-50/20 dark:bg-emerald-950/15 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30 transition-colors">
                    {MONTHS.map((m) => {
                      const liq = faturamentoLiquidoMes[m.key] || 0;
                      const isPositive = liq >= 0;
                      return (
                        <td
                          key={m.key}
                          className="p-1 border-r border-border/70 last:border-r-0 align-middle text-right bg-emerald-50/10 dark:bg-emerald-950/10"
                        >
                          <div
                            className={`px-2 py-2 text-right font-black text-xs sm:text-sm select-none ${
                              isPositive
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                            title={`Faturamento Líquido (${m.full}/${ano}): Bruto ${brl(activeMonthlyValues[m.key] || 0)} - Despesas ${brl(totalDespesasMes[m.key] || 0)}`}
                          >
                            {liq.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-2 font-black text-right bg-emerald-100/80 dark:bg-emerald-950/60 text-foreground align-middle text-sm sm:text-base border-l border-border">
                      <div className="flex items-center justify-between gap-1 px-1">
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">R$</span>
                        <span className={`font-black ${totalLiquidoAno >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600"}`}>
                          {totalLiquidoAno.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Linha 2: Despesas Totais Lançadas no Mês */}
                  <tr className="bg-background text-xs border-t border-border/50 text-muted-foreground hover:bg-muted/15 transition-colors">
                    {MONTHS.map((m) => {
                      const desp = totalDespesasMes[m.key] || 0;
                      return (
                        <td
                          key={m.key}
                          className="px-2 py-1.5 border-r border-border/70 last:border-r-0 text-right align-middle font-medium"
                          title={`Despesas quitadas em ${m.full}/${ano}`}
                        >
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">
                            {desp > 0 ? `-${desp.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "0,00"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right font-bold text-rose-600 dark:text-rose-400 bg-rose-50/30 dark:bg-rose-950/20 border-l border-border">
                      -{totalDespesasAno.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* Linha 3: Faturamento Bruto de Referência */}
                  <tr className="bg-muted/10 text-[11px] border-t border-border/40 text-muted-foreground">
                    {MONTHS.map((m) => {
                      const bruto = activeMonthlyValues[m.key] || 0;
                      return (
                        <td
                          key={m.key}
                          className="px-2 py-1 border-r border-border/70 last:border-r-0 text-right align-middle"
                        >
                          <span className="text-muted-foreground/80">
                            {bruto.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right font-semibold text-muted-foreground bg-muted/30 border-l border-border">
                      {totalAno.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* Linhas de Detalhamento Complementar de Despesas */}
                  <tr className="bg-muted/25 text-xs text-muted-foreground border-t border-border/60">
                    <td colSpan={12} className="px-3 py-1.5 font-medium">
                      <span className="font-bold text-foreground">Composição das Despesas ({ano}):</span> Contas a Pagar (quitadas): <strong className="text-foreground">{brl(totalContasPagarAno)}</strong> | Saídas Avulsas: <strong className="text-foreground">{brl(totalSaidasAvulsasAno)}</strong> | Total Despesas: <strong className="text-rose-600 dark:text-rose-400">{brl(totalDespesasAno)}</strong>
                    </td>
                    <td className="px-3 py-1.5 text-right font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10">
                      Margem: {margemLiquidaAno.toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-muted-foreground px-1 gap-2">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>
                O <strong>Faturamento Líquido</strong> deduz automaticamente todas as despesas lançadas e pagas (contas a pagar + saídas avulsas) do faturamento bruto mensal.
              </span>
            </span>
            <span>
              Melhor Mês Líquido: <strong className="text-emerald-600 dark:text-emerald-400">{melhorMesLiquido.nome} ({brl(melhorMesLiquido.valor)})</strong>
            </span>
          </div>
        </div>

        {/* ─── GRAFICOS: EVOLUÇÃO ANO A ANO E EVOLUÇÃO MENSAL ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* GRÁFICO 1: EVOLUÇÃO ANO A ANO */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-sky-500" />
                    Evolução Ano a Ano (Bruto vs Líquido)
                  </CardTitle>
                  <CardDescription>
                    Comparativo histórico do faturamento bruto, despesas e resultado líquido consolidado
                  </CardDescription>
                </div>
                <div className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  {dadosEvolucaoAnual.length} Anos
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dadosEvolucaoAnual} margin={{ top: 25, right: 15, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                    <XAxis dataKey="ano" tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                      tickLine={false}
                      axisLine={false}
                      width={65}
                    />
                    <Tooltip
                      formatter={(value: any, name: any) => [brl(Number(value)), name]}
                      labelFormatter={(label) => `Ano ${label}`}
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        borderColor: "var(--border)",
                        borderRadius: "8px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                      }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="Total" radius={[4, 4, 0, 0]} name="Faturamento Bruto" fill="#0284c7" />
                    <Bar dataKey="Liquido" radius={[4, 4, 0, 0]} name="Faturamento Líquido" fill="#10b981" />
                    <Line
                      type="monotone"
                      dataKey="Total"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#f59e0b", strokeWidth: 1 }}
                      name="Tendência Bruta"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Todos os Anos - Cards de Evolução Clicáveis */}
              <div className="mt-4 pt-3 border-t border-border/60">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center text-xs">
                  {dadosEvolucaoAnual.map((d) => (
                    <button
                      type="button"
                      key={d.ano}
                      onClick={() => setAno(d.anoNum)}
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer hover:border-sky-500/60 ${
                        d.anoNum === ano
                          ? "bg-sky-500/15 border-sky-500 font-bold shadow-xs"
                          : "bg-muted/30 border-border/50 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
                        <span>{d.ano}</span>
                        {d.anoNum === ano && (
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                        )}
                      </div>
                      <div className="font-extrabold text-foreground text-xs my-0.5 truncate" title={`Bruto: ${brl(d.Total)}`}>
                        {brl(d.Total)}
                      </div>
                      <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 truncate" title={`Líquido: ${brl(d.Liquido)}`}>
                        Líq: {brl(d.Liquido)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* GRÁFICO 2: EVOLUÇÃO MENSAL DO ANO SELECIONADO */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    Evolução Mensal ({ano})
                  </CardTitle>
                  <CardDescription>
                    Comparativo de Faturamento Bruto vs Despesas e Resultado Líquido em {ano}
                  </CardDescription>
                </div>
                <div className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  Líquido: {brl(totalLiquidoAno)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dadosGraficoMensal} margin={{ top: 15, right: 15, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                    <XAxis dataKey="mes" tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                      tickLine={false}
                      axisLine={false}
                      width={65}
                    />
                    <Tooltip
                      formatter={(value: any, name: any) => [brl(Number(value)), name]}
                      labelFormatter={(label) => {
                        const m = MONTHS.find((item) => item.label === label);
                        return m ? `${m.full} de ${ano}` : `${label} de ${ano}`;
                      }}
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        borderColor: "var(--border)",
                        borderRadius: "8px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                      }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="Total" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Faturamento Bruto" />
                    <Bar dataKey="Despesas" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Despesas" />
                    <Line
                      type="monotone"
                      dataKey="Faturamento Líquido"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#10b981" }}
                      name="Faturamento Líquido"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Destaques do Ano */}
              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Média Líquida: <strong className="text-emerald-600 dark:text-emerald-400">{brl(mediaMensalLiquida)}</strong>/mês
                </span>
                <span>
                  Melhor Mês Líquido: <strong className="text-emerald-600 dark:text-emerald-400">{melhorMesLiquido.nome} ({brl(melhorMesLiquido.valor)})</strong>
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── RESUMO HISTÓRICO COMPLETO ANO A ANO (TABELA) ─── */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Layers className="h-4 w-4 text-sky-500" />
              Histórico Consolidado de Todos os Anos (Bruto, Despesas e Líquido)
            </CardTitle>
            <CardDescription>
              Tabela comparativa do faturamento acumulado, despesas e resultado líquido por exercício fiscal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground border-b border-border text-left">
                    <th className="py-2.5 px-3 font-bold">Ano</th>
                    <th className="py-2.5 px-3 font-bold text-right">Faturamento Bruto</th>
                    <th className="py-2.5 px-3 font-bold text-right">Despesas Totais</th>
                    <th className="py-2.5 px-3 font-bold text-right text-emerald-600 dark:text-emerald-400">Faturamento Líquido</th>
                    <th className="py-2.5 px-3 font-bold text-right">Média Líquida/Mês</th>
                    <th className="py-2.5 px-3 font-bold text-center">Margem Líquida</th>
                    <th className="py-2.5 px-3 font-bold text-center">Crescimento Bruto</th>
                    <th className="py-2.5 px-3 font-bold text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {dadosEvolucaoAnual.map((item) => {
                    const isSelected = item.anoNum === ano;
                    return (
                      <tr
                        key={item.ano}
                        className={`hover:bg-muted/20 transition-colors ${
                          isSelected ? "bg-sky-500/5 font-semibold" : ""
                        }`}
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground text-sm">{item.ano}</span>
                            {isSelected && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-600 dark:text-sky-400">
                                Selecionado
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-foreground">
                          {brl(item.Total)}
                        </td>
                        <td className="py-3 px-3 text-right font-medium text-rose-600 dark:text-rose-400">
                          {brl(item.Despesas)}
                        </td>
                        <td className={`py-3 px-3 text-right font-extrabold text-sm ${item.Liquido >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                          {brl(item.Liquido)}
                        </td>
                        <td className="py-3 px-3 text-right text-muted-foreground">
                          {brl(item.Liquido / 12)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                              item.Margem > 0
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : item.Margem < 0
                                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {item.Margem.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                              item.crescimento > 0
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : item.crescimento < 0
                                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {item.crescimentoLabel}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                            onClick={() => setAno(item.anoNum)}
                          >
                            Ver Mês a Mês
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Footer Quick Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border/70 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-sky-500" />
            <span>Módulo de Faturamento Geral e Líquido consolidado do Gestor Financeiro Infortec.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={handleResetToSystem}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Restaurar Dados do Sistema
            </Button>
            {!isAllMonthsAuto && (
              <Button
                size="sm"
                className="h-8 text-xs bg-sky-600 hover:bg-sky-700 text-white font-semibold"
                onClick={() => saveMutation.mutate(isManualEdit ? "manual" : "automatic")}
                disabled={saveMutation.isPending}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                Salvar Alterações
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

