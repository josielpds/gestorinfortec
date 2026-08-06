import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface CaptchaProps {
  value: string;
  onChange: (value: string) => void;
  onAnswer: (answer: string) => void;
}

function makeQuestion() {
  const ops = ["+", "-", "×"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a = Math.floor(Math.random() * 9) + 1;
  let b = Math.floor(Math.random() * 9) + 1;
  if (op === "-" && b > a) [a, b] = [b, a];
  let answer: number;
  switch (op) {
    case "+": answer = a + b; break;
    case "-": answer = a - b; break;
    default: answer = a * b; break;
  }
  return { text: `${a} ${op} ${b}`, answer: String(answer) };
}

export function Captcha({ value, onChange, onAnswer }: CaptchaProps) {
  const [question, setQuestion] = useState(makeQuestion);

  useEffect(() => {
    onAnswer(question.answer);
    onChange("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  return (
    <div className="space-y-2">
      <Label>Verificação de segurança</Label>
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-md border bg-muted px-3 py-2 text-lg font-semibold tracking-widest select-none">
          {question.text} = ?
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setQuestion(makeQuestion())}
          title="Gerar nova pergunta"
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>
      <Input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite o resultado"
        required
      />
    </div>
  );
}

export function checkCaptcha(answer: string, value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed === answer;
}