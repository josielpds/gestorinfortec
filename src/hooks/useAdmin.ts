import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Perfil do usuário logado (inclui bloqueio e dados de assinatura). */
export function useMyProfile() {
  return useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, empresa, email, bloqueado, plano, assinatura_status, assinatura_expira")
        .eq("id", auth.user.id)
        .maybeSingle();
      return data;
    },
    staleTime: 30_000,
  });
}

/** Indica se o usuário logado tem o papel "master". */
export function useIsMaster() {
  const q = useQuery({
    queryKey: ["is-master"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("role", "master")
        .maybeSingle();
      return !!data;
    },
    staleTime: 60_000,
  });
  return { isMaster: q.data === true, isLoading: q.isLoading };
}
