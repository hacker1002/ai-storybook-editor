import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DocType } from "@/types/editor";

interface PromptPanelProps {
  docType: DocType;
  promptValue: string;
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
}

export function PromptPanel({
  promptValue,
  isGenerating,
  onPromptChange,
  onGenerate,
}: PromptPanelProps) {
  return (
    <div className="space-y-3 p-3">
      {/* Prompt textarea - all doc types */}
      <FormField label="PROMPT">
        <Textarea
          value={promptValue}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Enter your prompt for this manuscript..."
          className="min-h-[80px] resize-none"
        />
      </FormField>

      {/* Generate button */}
      <Button
        onClick={onGenerate}
        disabled={isGenerating || !promptValue.trim()}
        className="w-full"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate
          </>
        )}
      </Button>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
