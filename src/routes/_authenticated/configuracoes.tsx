import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { currentUserId } from "@/hooks/useCurrentUser";
import { baixarBackupCompleto, analisarArquivoBackup, restaurarBackupCompleto, BackupSummary } from "@/lib/backup";
import { CategoriasCard } from "@/components/CategoriasCard";
import { Download, UploadCloud, KeyRound, CheckCircle2, AlertTriangle, FileJson, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — CobraZap" },
      { name: "description", content: "Configure seu perfil, templates de mensagem e dados da empresa." },
    ],
  }),
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
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [senhaLoading, setSenhaLoading] = useState(false);

  useEffect(() => {
    const m: Record<string, string> = {};
    rows.forEach((r: any) => {
      m[r.key] = r.value ?? "";
    });
    setForm(m);
  }, [rows]);

  useEffect(() => {
    if (profile) {
      setNome(profile.nome ?? "");
      setEmpresa(profile.empresa ?? "");
    }
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("profiles").upsert({ id: user_id, nome, empresa });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil salvo");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const upserts = Object.entries(form).map(([key, value]) => ({ user_id, key, value }));
      const { error } = await supabase.from("configuracoes").upsert(upserts, { onConflict: "user_id,key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
        <PageHeader title="Configurações" subtitle="Personalize seu perfil, empresa e templates de mensagem" />

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Seu perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} />
              </div>
              <div>
                <Label>Empresa</Label>
                <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={100} />
              </div>
              <Button size="sm" onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
                {saveProfile.isPending ? "Salvando..." : "Salvar perfil"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Empresa (aparece nas mensagens)</CardTitle>
            </CardHeader>
            <CardContent>
              <Label>Nome da empresa</Label>
              <Input value={form.nome_empresa ?? ""} onChange={(e) => set("nome_empresa", e.target.value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Templates de Mensagem</CardTitle>
              <CardDescription>
                Use as variáveis: {"{nome}"}, {"{valor}"}, {"{descricao}"}, {"{vencimento}"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Cobrança padrão (Dia do Vencimento)</Label>
                <Textarea
                  rows={3}
                  value={form.template_cobranca ?? ""}
                  onChange={(e) => set("template_cobranca", e.target.value)}
                />
              </div>
              <div>
                <Label>Cobrança em atraso (Geral)</Label>
                <Textarea
                  rows={3}
                  value={form.template_atraso ?? ""}
                  onChange={(e) => set("template_atraso", e.target.value)}
                />
              </div>
              <div>
                <Label>Cobrança em atraso (5 dias após vencimento)</Label>
                <Textarea
                  rows={3}
                  value={form.template_atraso_5d ?? ""}
                  onChange={(e) => set("template_atraso_5d", e.target.value)}
                  placeholder="Olá {nome}, sua cobrança de {valor} venceu há 5 dias ({vencimento})..."
                />
              </div>
              <div>
                <Label>Cobrança em atraso (7 dias após vencimento)</Label>
                <Textarea
                  rows={3}
                  value={form.template_atraso_7d ?? ""}
                  onChange={(e) => set("template_atraso_7d", e.target.value)}
                  placeholder="Aviso Importante: Olá {nome}, sua cobrança de {valor} está com 7 dias de atraso ({vencimento})..."
                />
              </div>
              <div>
                <Label>Lembrete preventivo (Antes do vencimento)</Label>
                <Textarea
                  rows={3}
                  value={form.template_lembrete ?? ""}
                  onChange={(e) => set("template_lembrete", e.target.value)}
                />
              </div>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Salvando..." : "Salvar templates"}
              </Button>
            </CardContent>
          </Card>

          <CategoriasCard />

          <Card>
            <CardHeader>
              <CardTitle>Backup e Restauração dos dados</CardTitle>
              <CardDescription>
                Baixe um arquivo JSON com todas as suas informações ou restaure um backup feito anteriormente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={backupLoading}
                  onClick={async () => {
                    setBackupLoading(true);
                    try {
                      const r = await baixarBackupCompleto();
                      toast.success(
                        `Backup gerado: ${r.clientes} clientes, ${r.cobrancas} cobranças, ${r.movimentacoes} movimentações`
                      );
                    } catch (e: any) {
                      toast.error(e.message);
                    } finally {
                      setBackupLoading(false);
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {backupLoading ? "Gerando backup..." : "Fazer backup completo agora"}
                </Button>

                <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-primary/40 hover:bg-primary/5">
                      <UploadCloud className="h-4 w-4 mr-2 text-primary" />
                      Restaurar backup
                    </Button>
                  </DialogTrigger>
                  {restoreOpen && (
                    <RestaurarBackupModal
                      onClose={() => setRestoreOpen(false)}
                      onSuccess={() => {
                        qc.invalidateQueries();
                        setRestoreOpen(false);
                      }}
                    />
                  )}
                </Dialog>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Alterar senha</CardTitle>
              <CardDescription>Defina uma nova senha de acesso à sua conta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nova senha</Label>
                <Input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>
              <div>
                <Label>Confirmar nova senha</Label>
                <Input
                  type="password"
                  value={confirmaSenha}
                  onChange={(e) => setConfirmaSenha(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={senhaLoading}
                onClick={async () => {
                  if (novaSenha.length < 6) {
                    toast.error("A senha deve ter no mínimo 6 caracteres");
                    return;
                  }
                  if (novaSenha !== confirmaSenha) {
                    toast.error("As senhas não conferem");
                    return;
                  }
                  setSenhaLoading(true);
                  const { error } = await supabase.auth.updateUser({ password: novaSenha });
                  setSenhaLoading(false);
                  if (error) {
                    toast.error(error.message);
                    return;
                  }
                  setNovaSenha("");
                  setConfirmaSenha("");
                  toast.success("Senha alterada com sucesso");
                }}
              >
                <KeyRound className="h-4 w-4 mr-2" />
                {senhaLoading ? "Alterando..." : "Alterar senha"}
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

function RestaurarBackupModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setAnalyzing(true);
    setSummary(null);
    setParsedData(null);
    try {
      const { payload, summary: s } = await analisarArquivoBackup(f);
      setSummary(s);
      setParsedData(payload);
    } catch (err: any) {
      toast.error(err.message || "Erro ao analisar o arquivo de backup.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!parsedData) return;
    setRestoring(true);
    try {
      const res = await restaurarBackupCompleto(parsedData);
      toast.success(
        `Backup restaurado com sucesso! (${res.total} registros: ${res.clientes} clientes, ${res.cobrancas} cobranças, ${res.movimentacoes} movimentações)`
      );
      onSuccess();
    } catch (err: any) {
      console.error("Erro ao restaurar backup:", err);
      toast.error(err.message || "Falha ao restaurar dados do backup.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-[550px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <UploadCloud className="h-5 w-5 text-primary" />
          Restaurar backup dos dados
        </DialogTitle>
        <DialogDescription>
          Selecione o arquivo de backup (.json) gerado anteriormente para restaurar seus dados nesta conta.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-3">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
          <FileJson className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          {file ? (
            <div>
              <p className="font-semibold text-sm text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(file.size / 1024).toFixed(1)} KB — Clique para escolher outro arquivo
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium">Clique para selecionar o arquivo .JSON de backup</p>
              <p className="text-xs text-muted-foreground mt-1">Compatível com backups exportados do CobraZap</p>
            </div>
          )}
        </div>

        {analyzing && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            Lendo e validando estrutura do arquivo...
          </div>
        )}

        {summary && (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Registros encontrados no arquivo
              </span>
              <Badge variant="outline" className="bg-success/10 text-success border-success/30 font-medium">
                {summary.total} itens
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-background rounded p-2 border">
                <span className="text-muted-foreground block">Clientes:</span>
                <span className="font-semibold text-sm">{summary.clientes}</span>
              </div>
              <div className="bg-background rounded p-2 border">
                <span className="text-muted-foreground block">Cobranças:</span>
                <span className="font-semibold text-sm">{summary.cobrancas}</span>
              </div>
              <div className="bg-background rounded p-2 border">
                <span className="text-muted-foreground block">Contas a Pagar:</span>
                <span className="font-semibold text-sm">{summary.contas_pagar}</span>
              </div>
              <div className="bg-background rounded p-2 border">
                <span className="text-muted-foreground block">Movimentações:</span>
                <span className="font-semibold text-sm">{summary.movimentacoes}</span>
              </div>
              <div className="bg-background rounded p-2 border">
                <span className="text-muted-foreground block">Categorias:</span>
                <span className="font-semibold text-sm">{summary.categorias}</span>
              </div>
              <div className="bg-background rounded p-2 border">
                <span className="text-muted-foreground block">Configurações:</span>
                <span className="font-semibold text-sm">{summary.configuracoes}</span>
              </div>
            </div>

            {summary.gerado_em && (
              <p className="text-[11px] text-muted-foreground pt-1">
                Data de geração do backup: {new Date(summary.gerado_em).toLocaleString("pt-BR")}
              </p>
            )}

            <div className="flex items-start gap-2 bg-warning/10 text-warning-foreground border border-warning/30 rounded p-2.5 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning-foreground" />
              <span>
                A restauração importará e atualizará os registros na sua conta atual. Dados existentes com o mesmo
                identificador serão mesclados e mantidos seguros.
              </span>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onClose} disabled={restoring}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleExecuteRestore}
          disabled={!parsedData || restoring || analyzing}
          className="bg-primary hover:bg-primary/90"
        >
          {restoring ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Restaurando dados...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirmar e Restaurar
            </>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

