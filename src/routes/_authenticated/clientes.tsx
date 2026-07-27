import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/hooks/useCurrentUser";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "Clientes — CobraZap" }, { name: "description", content: "Cadastro e gestão de clientes." }] }),
  component: ClientesPage,
});

type Cliente = {
  id: string; nome: string; telefone: string; email: string | null;
  documento: string | null; observacoes: string | null; ativo: boolean; created_at: string;
};

function ClientesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const save = useMutation({
    mutationFn: async (payload: Partial<Cliente>) => {
      if (editing) {
        const { error } = await supabase.from("clientes").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const user_id = await currentUserId();
        const { error } = await supabase.from("clientes").insert({ ...(payload as any), user_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Cliente atualizado" : "Cliente cadastrado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cliente removido"); qc.invalidateQueries({ queryKey: ["clientes"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = clientes.filter((c) =>
    (c.nome + " " + c.telefone + " " + (c.email ?? "")).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="p-8 max-w-[1400px]">
        <PageHeader
          title="Clientes"
          subtitle="Gerencie seus clientes cadastrados"
          action={
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Novo Cliente</Button></DialogTrigger>
              <ClienteFormDialog editing={editing} onSubmit={(p) => save.mutate(p)} loading={save.isPending} />
            </Dialog>
          }
        />

        <div className="mb-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">Nenhum cliente cadastrado</div>
            ) : (
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Nome</th>
                    <th className="text-left px-4 py-3">Telefone</th>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-left px-4 py-3">Documento</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{c.nome}</td>
                      <td className="px-4 py-3">{c.telefone}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.email ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.documento ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir cliente?")) remove.mutate(c.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function ClienteFormDialog({ editing, onSubmit, loading }: { editing: Cliente | null; onSubmit: (p: any) => void; loading: boolean }) {
  const [form, setForm] = useState({
    nome: editing?.nome ?? "",
    telefone: editing?.telefone ?? "",
    email: editing?.email ?? "",
    documento: editing?.documento ?? "",
    observacoes: editing?.observacoes ?? "",
    ativo: editing?.ativo ?? true,
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} Cliente</DialogTitle></DialogHeader>
      <div className="grid gap-4 py-2">
        <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Telefone (WhatsApp) *</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(11) 98888-8888" /></div>
          <div><Label>Documento (CPF/CNPJ)</Label><Input value={form.documento ?? ""} onChange={(e) => setForm({ ...form, documento: e.target.value })} /></div>
        </div>
        <div><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><Label>Observações</Label><Textarea value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} /></div>
      </div>
      <DialogFooter>
        <Button disabled={loading || !form.nome || !form.telefone} onClick={() => onSubmit(form)}>
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
