// add-section-input.tsx - Inline input for naming a new section in branch sidebar
"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "AddSectionInput");

interface AddSectionInputProps {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirmDisabled: boolean;
}

export function AddSectionInput({
  value,
  onChange,
  onConfirm,
  onCancel,
  isConfirmDisabled,
}: AddSectionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    log.debug("AddSectionInput", "mounted, focusing input");
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      log.debug("handleKeyDown", "Enter pressed", { value });
      if (!isConfirmDisabled) onConfirm();
    } else if (e.key === "Escape") {
      log.debug("handleKeyDown", "Escape pressed");
      onCancel();
    }
  };

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Section name..."
        className="h-7 text-sm flex-1"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={onConfirm}
        disabled={isConfirmDisabled}
        aria-label="Confirm add section"
      >
        <Check className="w-4 h-4" />
      </Button>
    </div>
  );
}
