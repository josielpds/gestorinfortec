import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { todayISO } from "@/lib/format";

interface MonthFilterProps {
  selectedMonth: string; // "YYYY-MM" or "todos"
  onChange: (month: string) => void;
  allowAll?: boolean;
  className?: string;
}

export function formatMonthLabel(ym: string): string {
  if (!ym || ym === "todos") return "Todos os meses";
  const [yearStr, monthStr] = ym.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month)) return ym;
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
}

export function getRelativeMonth(ym: string, offset: number): string {
  const currentYM = ym && ym !== "todos" ? ym : todayISO().slice(0, 7);
  const [yearStr, monthStr] = currentYM.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const date = new Date(year, month - 1 + offset, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function MonthFilter({ selectedMonth, onChange, allowAll = true, className = "" }: MonthFilterProps) {
  const currentMonthISO = todayISO().slice(0, 7);

  // Generate options for past 12 months, current month, and next 12 months
  const options: { value: string; label: string }[] = [];
  if (allowAll) {
    options.push({ value: "todos", label: "Todos os meses" });
  }

  const baseYear = parseInt(currentMonthISO.split("-")[0], 10);
  const baseMonth = parseInt(currentMonthISO.split("-")[1], 10);

  for (let i = -12; i <= 12; i++) {
    const d = new Date(baseYear, baseMonth - 1 + i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const val = `${y}-${m}`;
    options.push({
      value: val,
      label: formatMonthLabel(val),
    });
  }

  const handlePrev = () => {
    onChange(getRelativeMonth(selectedMonth, -1));
  };

  const handleNext = () => {
    onChange(getRelativeMonth(selectedMonth, 1));
  };

  const isCurrentMonth = selectedMonth === currentMonthISO;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1 bg-card border rounded-lg p-1 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handlePrev}
          title="Mês Anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <Select value={selectedMonth} onValueChange={onChange}>
          <SelectTrigger className="h-8 min-w-[170px] border-none shadow-none text-xs font-semibold focus:ring-0">
            <Calendar className="h-3.5 w-3.5 mr-1.5 text-primary" />
            <SelectValue placeholder="Selecione o mês" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleNext}
          title="Próximo Mês"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {!isCurrentMonth && (
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          onClick={() => onChange(currentMonthISO)}
        >
          Mês Atual
        </Button>
      )}
    </div>
  );
}
