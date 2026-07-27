import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { currentUserId } from "@/hooks/useCurrentUser";

export const Route = createFileRoute("/_authenticated/categorias")({
  head: () => ({ meta: [
    { title: "Categorias — CobraZap" },
    { name: "description", content: "Organize suas movimentações financeiras com categorias personalizadas." },
  ] }),
  component: CategoriasPage,
});

type Cat = { id: string; nome: string; tipo: "entrada" | "saida"; created_at: string };

function CategoriasPage() {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "saida">("saida");

  const { data: cats = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: async () => ((await supabase.from("categorias").select("*").order("tipo").order("nome")).data ?? []) as Cat[],
  });

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("categorias").insert({ nome: nome.trim(), tipo, user_id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Categoria criada"); qc.invalidateQueries({ queryKey: ["categorias"] }); setNome(""); },
    onError: (e: any) => toast.error(e.message.includes("duplicate") ? "Categoria já existe" : e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categorias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removida"); qc.invalidateQueries({ queryKey: ["categorias"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const entradas = cats.filter((c) => c.tipo === "entrada");
  const saidas = cats.filter((c) => c.tipo === "saida");

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl">
        <PageHeader title="Categorias" subtitle="Personalize as categorias usadas nas suas movimentações." />

        <Card className="mb-6">
          <CardHeader><CardTitle>Nova categoria</CardTitle></CardHeader>
          <CardContent>
            <form className="flex flex-wrap gap-3 items-end" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) create.mutate(); }}>
              <div className="flex-1 min-w-[200px]">
                <Label>Nome</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={50} placeholder="Ex: Energia elétrica" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={(v: "entrada" | "saida") => setTipo(v)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="saida">Saída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={!nome.trim() || create.isPending}>
                <Plus className="h-4 w-4 mr-2" /> Adicionar
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <CatList title="Entradas" items={entradas} onRemove={(id) => { if (confirm("Excluir categoria?")) remove.mutate(id); }} tone="success" />
          <CatList title="Saídas" items={saidas} onRemove={(id) => { if (confirm("Excluir categoria?")) remove.mutate(id); }} tone="destructive" />
        </div>
      </div>
    </AppLayout>
  );
}

function CatList({ title, items, onRemove, tone }: { title: string; items: Cat[]; onRemove: (id: string) => void; tone: "success" | "destructive" }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title} ({items.length})</CardTitle></CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Nenhuma categoria</div>
        ) : (
          <ul className="divide-y">
            {items.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3">
                <Badge variant="outline" className={tone === "success" ? "bg-success/10 text-success border-success/30" : "bg-destructive/10 text-destructive border-destructive/30"}>
                  {c.nome}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => onRemove(c.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
