import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, Receipt, MessageCircle, BarChart3, Settings, Zap, Wallet, FileMinus, LogOut, ShieldCheck, Lock, Menu } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIsMaster, useMyProfile } from "@/hooks/useAdmin";
import { useAtrasadasCount } from "@/hooks/useAtrasadas";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/cobrancas", label: "Contas a Receber", icon: Receipt },
  { to: "/contas-a-pagar", label: "Contas a Pagar", icon: FileMinus },
  { to: "/movimentacoes", label: "Lançamentos de Entradas e Saídas", icon: Wallet },
  { to: "/mensagens", label: "Disparar Mensagens", icon: MessageCircle },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { isMaster } = useIsMaster();
  const { data: profile } = useMyProfile();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = isMaster ? [...nav, { to: "/usuarios", label: "Usuários", icon: ShieldCheck }] : nav;

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (profile?.bloqueado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
            <Lock className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Acesso bloqueado</h1>
          <p className="text-muted-foreground">
            Sua conta está bloqueada pelo administrador. Entre em contato para regularizar sua
            assinatura e liberar o acesso.
          </p>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </div>
    );
  }

  const sidebar = (
    <SidebarContent userEmail={user?.email ?? null} items={items} onSignOut={signOut} onNavigate={() => setMenuOpen(false)} />
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 shrink-0 bg-sidebar text-sidebar-foreground flex-col">
        {sidebar}
      </aside>

      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 bg-sidebar text-sidebar-foreground px-4 h-14 border-b border-sidebar-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
            <Zap className="h-4 w-4" fill="currentColor" />
          </div>
          <div className="min-w-0">
            <div className="font-bold leading-tight truncate">CobraZap</div>
            <div className="text-[10px] opacity-70 leading-tight truncate">Cobranças via WhatsApp</div>
          </div>
        </div>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" aria-label="Abrir menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground border-sidebar-border">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
      </div>

      <main className="md:pl-64 flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}

function SidebarContent({
  items,
  userEmail,
  onSignOut,
  onNavigate,
}: {
  items: typeof nav;
  userEmail: string | null;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const atrasadas = useAtrasadasCount();

  return (
    <>
      <div className="px-5 py-6 flex items-center gap-3 border-b border-sidebar-border">
        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
          <Zap className="h-5 w-5" fill="currentColor" />
        </div>
        <div>
          <div className="font-bold text-lg leading-tight">CobraZap</div>
          <div className="text-xs opacity-70 leading-tight">Cobranças via WhatsApp</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((n) => {
          const active = pathname === n.to || pathname.startsWith(n.to + "/");
          const Icon = n.icon;
          const alerta = n.to === "/mensagens" && atrasadas > 0;
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground font-medium"
                  : alerta
                    ? "bg-destructive/15 text-destructive font-medium hover:bg-destructive/25"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{n.label}</span>
              {alerta && (
                <span
                  title={`${atrasadas} mensalidade(s) em atraso`}
                  className={cn(
                    "min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center",
                    active
                      ? "bg-primary-foreground text-primary"
                      : "bg-destructive text-destructive-foreground",
                  )}
                >
                  {atrasadas}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
        {userEmail && (
          <div className="px-2 text-xs opacity-70 truncate" title={userEmail}>
            {userEmail}
          </div>
        )}
        <Button variant="ghost" size="sm" className="w-full justify-start hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={onSignOut}>
          <LogOut className="h-4 w-4 mr-2" /> Sair
        </Button>
      </div>
    </>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action && <div className="sm:shrink-0">{action}</div>}
    </div>
  );
}
