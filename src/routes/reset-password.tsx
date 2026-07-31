import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Zap } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — CobraZap" },
      { name: "description", content: "Crie uma nova senha para acessar sua conta CobraZap." },
      { property: "og:title", content: "Redefinir senha — CobraZap" },
      { property: "og:description", content: "Crie uma nova senha para acessar sua conta CobraZap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash ?? "";
    const recovery = hash.includes("type=recovery");
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setPronto(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session || recovery) setPronto(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 6) { toast.error("A senha deve ter no mínimo 6 caracteres"); return; }
    if (senha !== confirma) { toast.error("As senhas não conferem"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Senha alterada! Faça login novamente.");
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-3 mb-8">
          <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
            <Zap className="h-5 w-5" fill="currentColor" />
          </div>
          <div className="font-bold text-xl">CobraZap</div>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Redefinir senha</CardTitle>
            <CardDescription>
              {pronto
                ? "Digite sua nova senha de acesso."
                : "Abra esta página pelo link enviado no seu email para redefinir a senha."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pronto ? (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label>Nova senha</Label>
                  <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" minLength={6} required />
                </div>
                <div>
                  <Label>Confirmar nova senha</Label>
                  <Input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" minLength={6} required />
                </div>
                <Button className="w-full" disabled={loading}>{loading ? "Salvando..." : "Salvar nova senha"}</Button>
              </form>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Voltar para o login
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
