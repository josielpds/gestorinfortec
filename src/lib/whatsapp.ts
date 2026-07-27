import { brl, fmtDate } from "./format";

export const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

export function waLink(telefone: string, mensagem: string) {
  const num = onlyDigits(telefone);
  const withCountry = num.length <= 11 ? `55${num}` : num;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(mensagem)}`;
}

export function renderTemplate(tpl: string, vars: {
  nome: string; valor: number | string; descricao: string; vencimento: string;
}) {
  return tpl
    .replaceAll("{nome}", vars.nome ?? "")
    .replaceAll("{valor}", brl(vars.valor).replace("R$", "").trim())
    .replaceAll("{descricao}", vars.descricao ?? "")
    .replaceAll("{vencimento}", fmtDate(vars.vencimento));
}
