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

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — CobraZap" }, { name: "description", content: "Configure templates de mensagens e dados da empresa." }] }),
  component: ConfigPage,
});

function ConfigPage() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["cfg-all-page"],
    queryFn: async () => (await supabase.from("configuracoes").select("*")).data ?? [],
  });

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    const m: Record<string, string> = {};
    rows.forEach((r: any) => { m[r.key] = r.value ?? ""; });
    setForm(m);
  }, [rows]);

  const save = useMutation({
    mutationFn: async () => {
      const upserts = Object.entries(form).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from("configuracoes").upsert(upserts, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Configurações salvas"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <AppLayout>
      <div className="p-8 max-w-3xl">
        <PageHeader title="Configurações" subtitle="Personalize templates de mensagens e dados da empresa" />

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Empresa</CardTitle></CardHeader>
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

          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar configurações"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
