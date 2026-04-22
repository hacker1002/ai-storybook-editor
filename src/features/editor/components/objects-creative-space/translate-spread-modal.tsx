"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useInteractionLayer } from "@/features/editor/contexts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Languages } from "lucide-react";
import { toast } from "sonner";
import { createLogger } from "@/utils/logger";
import { callTranslateContent, type TranslateContentErrorCode } from "@/apis/text-api";
import { getLanguageName } from "@/constants/config-constants";
import type { SpreadTextbox, SpreadTextboxContent } from "@/types/spread-types";

const log = createLogger("UI", "TranslateSpreadModal");

const CHECK_ICON_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'><path d='M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3-3a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z'/></svg>\")";

const CHECKBOX_CLASS =
  "cursor-pointer h-[18px] w-[18px] appearance-none rounded-md border border-blue-400 bg-white bg-no-repeat bg-center checked:bg-blue-500 checked:border-blue-500 indeterminate:bg-blue-500 indeterminate:border-blue-500";

export type TranslationRowKind = "textbox";

export interface TranslationRow {
  id: string;
  kind: TranslationRowKind;
  original: string;
  translation: string;
  checked: boolean;
}

export interface TranslationResult {
  id: string;
  translated_text: string;
}

export interface ApplyTranslationsPayload {
  spreadId: string;
  targetLang: string;
  results: TranslationResult[];
}

export interface TranslateSpreadModalProps {
  isOpen: boolean;
  onClose: () => void;
  spreadId: string;
  textboxes: SpreadTextbox[];
  originalLang: string;
  editorLang: string;
  context?: string;
  onApplyTranslations: (payload: ApplyTranslationsPayload) => void;
}

function getContent(tb: SpreadTextbox, lang: string): SpreadTextboxContent | undefined {
  const value = (tb as Record<string, unknown>)[lang];
  if (value && typeof value === "object" && "text" in (value as object)) {
    return value as SpreadTextboxContent;
  }
  return undefined;
}

function buildRows(
  textboxes: SpreadTextbox[],
  originalLang: string,
  editorLang: string
): TranslationRow[] {
  if (originalLang === editorLang) return [];
  const rows: TranslationRow[] = [];
  for (const tb of textboxes) {
    const original = getContent(tb, originalLang);
    if (!original || !original.text?.trim()) continue;
    const existing = getContent(tb, editorLang);
    const translation = existing?.text ?? "";
    rows.push({
      id: tb.id,
      kind: "textbox",
      original: original.text,
      translation,
      checked: false,
    });
  }
  return rows;
}

function mapErrorCodeToMessage(
  code: TranslateContentErrorCode | undefined,
  fallback: string
): string {
  switch (code) {
    case "LLM_ERROR":
      return "Translation service unavailable. Please retry.";
    case "LENGTH_MISMATCH":
      return "Translation incomplete. Please retry.";
    case "VALIDATION":
      return "Invalid input.";
    case "SAME_LANGUAGE":
      return "Source and target languages must differ.";
    case "CONNECTION_ERROR":
      return fallback;
    case "ABORT":
      return "Request cancelled.";
    default:
      return fallback || "Translation failed. Please retry.";
  }
}

export function TranslateSpreadModal({
  isOpen,
  onClose,
  spreadId,
  textboxes,
  originalLang,
  editorLang,
  context,
  onApplyTranslations,
}: TranslateSpreadModalProps) {
  const [rows, setRows] = useState<TranslationRow[]>([]);
  const [promptText, setPromptText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setRows(buildRows(textboxes, originalLang, editorLang));
      setPromptText("");
    } else {
      abortRef.current?.abort();
    }
  }, [isOpen, spreadId, originalLang, editorLang, textboxes]);

  const allChecked = rows.length > 0 && rows.every(r => r.checked);
  const selectedCount = useMemo(() => rows.filter(r => r.checked).length, [rows]);
  const canGenerate = selectedCount > 0 && !isGenerating && originalLang !== editorLang;

  const handleToggleRow = useCallback((id: string) => {
    log.debug("handleToggleRow", "toggle", { id });
    setRows(prev => prev.map(r => (r.id === id ? { ...r, checked: !r.checked } : r)));
  }, []);

  const handleToggleAll = useCallback(() => {
    setRows(prev => {
      const nextChecked = !(prev.length > 0 && prev.every(r => r.checked));
      return prev.map(r => ({ ...r, checked: nextChecked }));
    });
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && isGenerating) {
        abortRef.current?.abort();
        onClose();
        return;
      }
      if (!next) onClose();
    },
    [isGenerating, onClose]
  );

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    const selected = rows.filter(r => r.checked);
    const indexToId = selected.map(r => r.id);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsGenerating(true);

    log.info("handleGenerate", "start", {
      count: selected.length,
      src: originalLang,
      tgt: editorLang,
      hasPrompt: promptText.trim().length > 0,
      hasContext: Boolean(context),
    });

    try {
      const res = await callTranslateContent(
        {
          content: selected.map(r => r.original),
          sourceLanguage: getLanguageName(originalLang),
          targetLanguage: getLanguageName(editorLang),
          prompt: promptText.trim() || undefined,
          context: context || undefined,
        },
        { signal: ctrl.signal }
      );

      if (ctrl.signal.aborted) return;

      if (!res.success) {
        if (res.errorCode === "ABORT") return;
        log.error("handleGenerate", "failed", {
          errorCode: res.errorCode,
          msg: res.error.slice(0, 100),
        });
        toast.error(mapErrorCodeToMessage(res.errorCode, res.error));
        return;
      }

      const translations = res.data.translations;
      const results: TranslationResult[] = indexToId.map((id, i) => ({
        id,
        translated_text: translations[i],
      }));
      const translatedMap = new Map(results.map(r => [r.id, r.translated_text]));

      setRows(prev =>
        prev.map(r => {
          const hit = translatedMap.get(r.id);
          return hit !== undefined ? { ...r, translation: hit, checked: false } : r;
        })
      );

      onApplyTranslations({ spreadId, targetLang: editorLang, results });
      log.info("handleGenerate", "success", { applied: results.length });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      if (!ctrl.signal.aborted) setIsGenerating(false);
    }
  }, [
    canGenerate,
    rows,
    originalLang,
    editorLang,
    promptText,
    context,
    spreadId,
    onApplyTranslations,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        const target = e.target as HTMLElement;
        if (target.tagName === "TEXTAREA") {
          e.preventDefault();
          if (canGenerate) handleGenerate();
        }
      }
    },
    [canGenerate, handleGenerate]
  );

  useInteractionLayer(
    "modal",
    isOpen
      ? {
          id: "translate-spread-modal",
          ref: dialogContentRef,
          captureClickOutside: true,
          hotkeys: ["Escape"],
          portalSelectors: ["[data-radix-popper-content-wrapper]"],
          onHotkey: key => {
            if (key === "Escape" && !isGenerating) onClose();
          },
          onClickOutside: () => {
            if (!isGenerating) onClose();
          },
          onForcePop: () => {
            abortRef.current?.abort();
            setIsGenerating(false);
          },
        }
      : null
  );

  const sameLang = originalLang === editorLang;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className="sm:max-w-[720px]"
        onKeyDown={handleKeyDown}
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Translate
          </DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <Languages className="h-8 w-8" />
            <p className="text-sm text-center">
              {sameLang
                ? "Editor language matches original. Switch editor language to translate."
                : "No textboxes to translate on this spread."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-h-[400px] overflow-y-auto border rounded-md">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground w-1/2">Original</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground w-1/2">Translation</th>
                    <th className="px-3 py-2.5 w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allChecked}
                        onChange={handleToggleAll}
                        className={CHECKBOX_CLASS}
                        style={allChecked ? { backgroundImage: CHECK_ICON_URL } : undefined}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr
                      key={row.id}
                      onClick={() => handleToggleRow(row.id)}
                      className="border-b last:border-b-0 border-border/40 hover:bg-muted/50 cursor-pointer"
                    >
                      <td className="px-3 py-4 align-top whitespace-pre-wrap break-words">
                        {row.original}
                      </td>
                      <td className="px-3 py-4 align-top whitespace-pre-wrap break-words text-muted-foreground">
                        {row.translation || "—"}
                      </td>
                      <td className="px-3 py-4 text-center align-top">
                        <input
                          type="checkbox"
                          aria-label={`Select row ${row.id}`}
                          checked={row.checked}
                          onChange={() => handleToggleRow(row.id)}
                          onClick={e => e.stopPropagation()}
                          className={CHECKBOX_CLASS}
                          style={row.checked ? { backgroundImage: CHECK_ICON_URL } : undefined}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Textarea
              id="translate-prompt"
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
              placeholder="Prompt"
              rows={3}
              maxLength={500}
              disabled={isGenerating}
            />

            <div className="flex justify-center">
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
                aria-label="Generate translations"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : selectedCount > 0 ? (
                  `Generate (${selectedCount})`
                ) : (
                  "Generate"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
