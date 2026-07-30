import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, Lock, Unlock, Search } from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { useIsMaster } from "@/hooks/useAdmin";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — CobraZap" },
      {
        name: "description",
        content: "Painel master: gerencie assinaturas, papéis e bloqueio dos usuários do CobraZap.",
      },
    ],
  }),
  component: Usuarios,
});

type Perfil = {
  id: string;
  nome: string | null;
  empresa: string | null;
  email: string | null;
  bloqueado: boolean;
  plano: string;
  assinatura_status: string;
  assinatura_expira: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  ativa: "bg-success/15 text-success border-success/30",
  trial: "bg-info/10 text-info border-info/30",
  vencida: "bg-destructive/10 text-destructive border-destructive/30",
  cancelada: "bg-muted text-muted-foreground",
};

function Usuarios() {
  const { isMaster, isLoading: loadingRole } = useIsMaster();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");

  const { data: perfis } = useQuery({
    queryKey: ["admin-usuarios"],
    enabled: isMaster,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, empresa, email, bloqueado, plano, assinatura_status, assinatura_expira, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Perfil[];
    },
  });

  const { data: papeis } = useQuery({
    queryKey: ["admin-papeis"],
    enabled: isMaster,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data ?? [];
    },
  });

  const atualizar = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<Perfil, "plano" | "assinatura_status" | "assinatura_expira" | "bloqueado">>;
    }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-usuarios"] });
      toast.success("Usuário atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternarMaster = useMutation({
    mutationFn: async ({ id, tornarMaster }: { id: string; tornarMaster: boolean }) => {
      if (tornarMaster) {
        const { error } = await supabase.from("user_roles").insert({ user_id: id, role: "master" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", id)
          .eq("role", "master");
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-papeis"] });
      toast.success("Permissões atualizadas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!loadingRole && !isMaster) {
    return (
      <AppLayout>
        <div className="p-8 max-w-2xl">
          <PageHeader title="Acesso restrito" subtitle="Esta área é exclusiva do usuário master." />
        </div>
      </AppLayout>
    );
  }

  const lista = (perfis ?? []).filter((p) => {
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    return [p.nome, p.empresa, p.email].some((v) => (v ?? "").toLowerCase().includes(t));
  });

  const masters = new Set((papeis ?? []).filter((r) => r.role === "master").map((r) => r.user_id));
  const bloqueados = (perfis ?? []).filter((p) => p.bloqueado).length;
  const ativas = (perfis ?? []).filter((p) => p.assinatura_status === "ativa").length;

  return (
    <AppLayout>
      <div className="p-8 max-w-[1400px]">
        <PageHeader
          title="Usuários"
          subtitle="Gerencie assinaturas, permissões e acesso dos usuários cadastrados"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs uppercase font-semibold text-muted-foreground">Usuários</div>
              <div className="text-2xl font-bold mt-2">{perfis?.length ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs uppercase font-semibold text-muted-foreground">Assinaturas ativas</div>
              <div className="text-2xl font-bold mt-2">{ativas}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs uppercase font-semibold text-muted-foreground">Bloqueados</div>
              <div className="text-2xl font-bold mt-2">{bloqueados}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Contas cadastradas
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, empresa ou e-mail"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                  <th className="px-3 py-2">Usuário</th>
                  <th className="px-3 py-2">Plano</th>
                  <th className="px-3 py-2">Assinatura</th>
                  <th className="px-3 py-2">Validade</th>
                  <th className="px-3 py-2">Papel</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lista.map((p) => (
                  <tr key={p.id} className={p.bloqueado ? "bg-destructive/5" : "hover:bg-muted/30"}>
                    <td className="px-3 py-3">
                      <div className="font-medium">{p.nome || "—"}</div>
                      <div className="text-xs text-muted-foreground">{p.email ?? "—"}</div>
                      {p.empresa && <div className="text-xs text-muted-foreground">{p.empresa}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        value={p.plano}
                        onValueChange={(v) => atualizar.mutate({ id: p.id, patch: { plano: v } })}
                      >
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="basico">Básico</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="premium">Premium</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        value={p.assinatura_status}
                        onValueChange={(v) =>
                          atualizar.mutate({ id: p.id, patch: { assinatura_status: v } })
                        }
                      >
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trial">Trial</SelectItem>
                          <SelectItem value="ativa">Ativa</SelectItem>
                          <SelectItem value="vencida">Vencida</SelectItem>
                          <SelectItem value="cancelada">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                      <Badge variant="outline" className={`mt-1 ${STATUS_TONE[p.assinatura_status] ?? ""}`}>
                        {p.assinatura_status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Input
                        type="date"
                        className="w-40"
                        defaultValue={p.assinatura_expira ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          if (v !== (p.assinatura_expira ?? null))
                            atualizar.mutate({ id: p.id, patch: { assinatura_expira: v } });
                        }}
                      />
                      {p.assinatura_expira && (
                        <div className="text-xs text-muted-foreground mt-1">
                          até {fmtDate(p.assinatura_expira)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {masters.has(p.id) ? (
                        <Badge className="bg-primary/10 text-primary border-primary/30" variant="outline">
                          Master
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Usuário</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            alternarMaster.mutate({ id: p.id, tornarMaster: !masters.has(p.id) })
                          }
                        >
                          {masters.has(p.id) ? "Remover master" : "Tornar master"}
                        </Button>
                        <Button
                          size="sm"
                          variant={p.bloqueado ? "outline" : "destructive"}
                          onClick={() =>
                            atualizar.mutate({ id: p.id, patch: { bloqueado: !p.bloqueado } })
                          }
                        >
                          {p.bloqueado ? (
                            <><Unlock className="h-4 w-4 mr-1" /> Liberar</>
                          ) : (
                            <><Lock className="h-4 w-4 mr-1" /> Bloquear</>
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                      Nenhum usuário encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
