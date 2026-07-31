import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/format";

/** Quantidade de cobranças/mensalidades em atraso do usuário logado. */
export function useAtrasadasCount() {
  const q = useQuery({
    queryKey: ["atrasadas-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("cobrancas")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente")
        .lt("vencimento", todayISO());
      return count ?? 0;
    },
    staleTime: 30_000,
  });
  return q.data ?? 0;
}
