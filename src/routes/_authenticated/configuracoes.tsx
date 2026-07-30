import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { currentUserId } from "@/hooks/useCurrentUser";
import { baixarBackupCompleto } from "@/lib/backup";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [
    { title: "Configurações — CobraZap" },
    { name: "description", content: "Configure seu perfil, templates de mensagem e dados da empresa." },
  ] }),
  component: ConfigPage,
});

function ConfigPage() {
  const qc = useQueryClient();

  const { data: rows = [] } = useQuery({
    queryKey: ["cfg-all-page"],
    queryFn: async () => (await supabase.from("configuracoes").select("*")).data ?? [],
  });

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await supabase.from("profiles").select("*").maybeSingle()).data,
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [backupLoading, setBackupLoading] = useState(false);

  useEffect(() => {
    const m: Record<string, string> = {};
    rows.forEach((r: any) => { m[r.key] = r.value ?? ""; });
    setForm(m);
  }, [rows]);

  useEffect(() => {
    if (profile) { setNome(profile.nome ?? ""); setEmpresa(profile.empresa ?? ""); }
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("profiles").upsert({ id: user_id, nome, empresa });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Perfil salvo"); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const upserts = Object.entries(form).map(([key, value]) => ({ user_id, key, value }));
      const { error } = await supabase.from("configuracoes").upsert(upserts, { onConflict: "user_id,key" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Configurações salvas"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <AppLayout>
      <div className="p-8 max-w-3xl">
        <PageHeader title="Configurações" subtitle="Personalize seu perfil, empresa e templates de mensagem" />

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Seu perfil</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} /></div>
              <div><Label>Empresa</Label><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={100} /></div>
              <Button size="sm" onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
                {saveProfile.isPending ? "Salvando..." : "Salvar perfil"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Empresa (aparece nas mensagens)</CardTitle></CardHeader>
            <CardContent>
              <Label>Nome da empresa</Label>
              <Input value={form.nome_empresa ?? ""} onChange={(e) => set("nome_empresa", e.target.value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Templates de Mensagem</CardTitle>
              <CardDescription>Use as variáveis: {"{nome}"}, {"{valor}"}, {"{descricao}"}, {"{vencimento}"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Cobrança padrão</Label>
                <Textarea rows={3} value={form.template_cobranca ?? ""} onChange={(e) => set("template_cobranca", e.target.value)} />
              </div>
              <div>
                <Label>Cobrança em atraso</Label>
                <Textarea rows={3} value={form.template_atraso ?? ""} onChange={(e) => set("template_atraso", e.target.value)} />
              </div>
              <div>
                <Label>Lembrete preventivo</Label>
                <Textarea rows={3} value={form.template_lembrete ?? ""} onChange={(e) => set("template_lembrete", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Backup dos dados</CardTitle>
              <CardDescription>Baixe um arquivo JSON com clientes, cobranças, movimentações, categorias e configurações.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" disabled={backupLoading} onClick={async () => {
                setBackupLoading(true);
                try {
                  const r = await baixarBackupCompleto();
                  toast.success(`Backup gerado: ${r.clientes} clientes, ${r.cobrancas} cobranças, ${r.movimentacoes} movimentações`);
                } catch (e: any) {
                  toast.error(e.message);
                } finally {
                  setBackupLoading(false);
                }
              }}>
                <Download className="h-4 w-4 mr-2" />
                {backupLoading ? "Gerando backup..." : "Fazer backup completo agora"}
              </Button>
            </CardContent>
          </Card>


          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar configurações"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
