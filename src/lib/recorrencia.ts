export const FREQ_LABEL: Record<string, string> = {
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

const DIAS: Record<string, number> = { semanal: 7, quinzenal: 15 };
const MESES: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

/** Próxima data de vencimento a partir de uma data ISO (yyyy-mm-dd) e uma frequência. */
export const proximaData = (iso: string, freq: string): string => {
  const d = new Date(iso + "T00:00:00");
  if (DIAS[freq]) {
    d.setDate(d.getDate() + DIAS[freq]);
  } else {
    const meses = MESES[freq] ?? 1;
    const dia = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + meses);
    // mantém o dia do mês, ajustando para meses mais curtos
    const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dia, ultimoDia));
  }
  return d.toISOString().slice(0, 10);
};

/** Gera as próximas N datas de vencimento, respeitando um limite opcional. */
export const gerarDatas = (iso: string, freq: string, qtd: number, limite?: string | null): string[] => {
  const out: string[] = [];
  let atual = iso;
  for (let i = 0; i < qtd; i++) {
    atual = proximaData(atual, freq);
    if (limite && atual > limite) break;
    out.push(atual);
  }
  return out;
};

/** Data do vencimento da N-ésima cobrança (contando a primeira como 1). */
export const quantidadeParaFim = (iso: string, freq: string, qtd: number): string => {
  if (qtd <= 1) return iso;
  const datas = gerarDatas(iso, freq, qtd - 1);
  return datas[datas.length - 1];
};

/** Quantas cobranças cabem da data inicial até a data limite (inclusive). */
export const fimParaQuantidade = (iso: string, freq: string, fim: string): number => {
  let count = 1;
  let atual = iso;
  while (true) {
    atual = proximaData(atual, freq);
    if (atual > fim) break;
    count++;
  }
  return count;
};
