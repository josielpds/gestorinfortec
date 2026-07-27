import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Zap, Users, Receipt, BarChart3, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CobraZap — Cobranças automáticas via WhatsApp" },
      { name: "description", content: "Gerencie clientes, cobranças e recebimentos. Dispare lembretes pelo WhatsApp em um clique." },
      { property: "og:title", content: "CobraZap — Cobranças automáticas via WhatsApp" },
      { property: "og:description", content: "Gerencie clientes, cobranças e recebimentos. Dispare lembretes pelo WhatsApp em um clique." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
            <Zap className="h-5 w-5" fill="currentColor" />
          </div>
          <div className="font-bold text-lg">CobraZap</div>
        </div>
        <Link to="/auth"><Button>Entrar</Button></Link>
      </header>

      <section className="max-w-4xl mx-auto text-center px-6 pt-16 pb-20">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
          Cobre seus clientes pelo WhatsApp, <span className="text-primary">sem esforço</span>.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground mt-6 max-w-2xl mx-auto">
          Cadastre clientes, controle cobranças, dispare lembretes com um clique e acompanhe seu faturamento em relatórios completos.
        </p>
        <div className="flex justify-center gap-3 mt-8">
          <Link to="/auth"><Button size="lg">Começar grátis</Button></Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto grid md:grid-cols-4 gap-4 px-6 pb-20">
        {[
          { icon: Users, title: "Clientes", desc: "Cadastro completo com histórico." },
          { icon: Receipt, title: "Cobranças", desc: "Controle pendentes, pagas e atrasadas." },
          { icon: MessageCircle, title: "WhatsApp", desc: "Envie lembretes em um clique." },
          { icon: BarChart3, title: "Relatórios", desc: "Faturamento, movimentações e inadimplência." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border p-5 bg-card">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
              <f.icon className="h-5 w-5" />
            </div>
            <div className="font-semibold">{f.title}</div>
            <div className="text-sm text-muted-foreground mt-1">{f.desc}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
