import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { downloadTemplate, parseDelimited, type ImportColumn } from "@/lib/import";

type Props = {
  title: string;
  description: string;
  templateName: string;
  columns: ImportColumn[];
  parse: (rows: string[][]) => { valid: any[]; skipped: number };
  onSubmit: (rows: any[]) => void;
  loading: boolean;
  itemLabel: string;
};

export function BulkImportDialog({ title, description, templateName, columns, parse, onSubmit, loading, itemLabel }: Props) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      setText(content);
      setFileName(file.name);
    };
    reader.readAsText(file);
  };

  const parsed = text.trim() ? parse(parseDelimited(text)) : null;
  const ok = parsed?.valid.length ?? 0;

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <div className="grid gap-4 py-2">
        <p className="text-sm text-muted-foreground">{description}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm"
            onClick={() => downloadTemplate(templateName, columns)}>
            <Download className="h-4 w-4 mr-2" /> Baixar modelo (.csv)
          </Button>
          <label className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm font-medium cursor-pointer hover:bg-accent">
            <FileUp className="h-4 w-4" /> {fileName ?? "Escolher arquivo CSV"}
            <input type="file" accept=".csv,.txt" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </label>
        </div>

        <div>
          <Label>Ou cole o conteúdo abaixo</Label>
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        </div>

        {parsed && (
          <p className="text-sm text-muted-foreground">
            {ok} {itemLabel}(s) válido(s)
            {parsed.skipped > 0 && <span className="text-destructive"> · {parsed.skipped} ignorada(s)</span>}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button disabled={loading || ok === 0} onClick={() => parsed && onSubmit(parsed.valid)}>
          {loading ? "Importando..." : `Importar ${ok} ${itemLabel}(s)`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
