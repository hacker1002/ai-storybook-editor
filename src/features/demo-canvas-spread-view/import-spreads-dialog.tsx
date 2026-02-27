"use client";

import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, ClipboardPaste, FileJson, AlertCircle } from "lucide-react";
import type { BaseSpread } from "@/components/canvas-spread-view";

interface ImportSpreadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (spreads: BaseSpread[]) => void;
}

function validateSpreads(data: unknown): data is BaseSpread[] {
  if (!Array.isArray(data)) return false;
  return data.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof item.id === "string" &&
      Array.isArray(item.pages) &&
      Array.isArray(item.images) &&
      Array.isArray(item.textboxes)
  );
}

export function ImportSpreadsDialog({
  open,
  onOpenChange,
  onImport,
}: ImportSpreadsDialogProps) {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setJsonText("");
    setError(null);
  }, []);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) resetState();
      onOpenChange(newOpen);
    },
    [onOpenChange, resetState]
  );

  const parseAndValidate = useCallback((text: string): BaseSpread[] | null => {
    try {
      const parsed = JSON.parse(text);
      const spreadsArray = Array.isArray(parsed) ? parsed : parsed.spreads;

      if (!validateSpreads(spreadsArray)) {
        setError(
          "Invalid format. Expected array of spreads with id, pages, images, textboxes."
        );
        return null;
      }

      setError(null);
      return spreadsArray;
    } catch {
      setError("Invalid JSON syntax.");
      return null;
    }
  }, []);

  const handleImport = useCallback(() => {
    const spreads = parseAndValidate(jsonText);
    if (spreads) {
      onImport(spreads);
      handleOpenChange(false);
    }
  }, [jsonText, parseAndValidate, onImport, handleOpenChange]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setJsonText(text);
      parseAndValidate(text);
    } catch {
      setError("Failed to read clipboard. Please paste manually.");
    }
  }, [parseAndValidate]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setJsonText(text);
        parseAndValidate(text);
      };
      reader.onerror = () => setError("Failed to read file.");
      reader.readAsText(file);

      e.target.value = "";
    },
    [parseAndValidate]
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      setJsonText(text);
      if (text.trim()) {
        parseAndValidate(text);
      } else {
        setError(null);
      }
    },
    [parseAndValidate]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Import Spreads JSON
          </DialogTitle>
          <DialogDescription>
            Paste JSON data or upload a file containing spread data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePasteFromClipboard}
              className="flex-1"
            >
              <ClipboardPaste className="h-4 w-4 mr-2" />
              Paste from Clipboard
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="json-input">JSON Data</Label>
            <Textarea
              id="json-input"
              value={jsonText}
              onChange={handleTextChange}
              placeholder='[{"id": "spread-1", "pages": [...], "images": [...], "textboxes": [...]}]'
              className="min-h-[200px] font-mono text-xs"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!jsonText.trim() || !!error}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
