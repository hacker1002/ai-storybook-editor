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
import { Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { createLogger } from "@/utils/logger";
import {
  callEnhanceNarration,
  MAX_NARRATIONS_PER_BATCH,
  MAX_NARRATION_CHARS,
  NARRATOR_KEY,
  type EnhanceNarrationErrorCode,
  type Reader,
} from "@/apis/text-api";
import type {
  SpreadTextbox,
  SpreadTextboxContent,
  TextboxAudio,
} from "@/types/spread-types";
import { EnhancedScriptTextarea } from "./enhanced-script-textarea";

const log = createLogger("UI", "EnhanceSpreadNarrationModal");

const CHECK_ICON_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'><path d='M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3-3a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z'/></svg>\")";

const CHECKBOX_CLASS =
  "cursor-pointer h-[18px] w-[18px] appearance-none rounded-md border border-blue-400 bg-white bg-no-repeat bg-center checked:bg-blue-500 checked:border-blue-500 indeterminate:bg-blue-500 indeterminate:border-blue-500";

export interface EnhanceRow {
  id: string;
  original: string;
  enhanced: string; // session-only; pre-seeded with existingPreview so textarea is directly editable
  initialEnhanced: string; // snapshot of `enhanced` at row build / after Enhance — used to detect user edits
  existingPreview: string; // display-only fallback
  checked: boolean;
}

export interface EnhancementResult {
  id: string;
  enhanced_script: string;
}

export interface ApplyEnhancementsPayload {
  spreadId: string;
  language: string;
  results: EnhancementResult[];
  readerToVoice: Record<string, string>;
}

export interface EnhanceSpreadNarrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  spreadId: string;
  textboxes: SpreadTextbox[];
  editorLang: string;
  readers: Reader[];
  readerToVoice: Record<string, string>;
  context?: string;
  onApplyEnhancements: (payload: ApplyEnhancementsPayload) => void;
}

function getContent(
  tb: SpreadTextbox,
  lang: string
): SpreadTextboxContent | undefined {
  const value = (tb as Record<string, unknown>)[lang];
  if (value && typeof value === "object" && "text" in (value as object)) {
    return value as SpreadTextboxContent;
  }
  return undefined;
}

// Reverse map readerToVoice. Conflict (1 voice → multi readers): prefer the
// non-narrator key so dialog labels favor character attribution.
function buildVoiceToReader(
  readerToVoice: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, voiceId] of Object.entries(readerToVoice)) {
    const existing = result[voiceId];
    if (existing === undefined) {
      result[voiceId] = key;
      continue;
    }
    if (existing === NARRATOR_KEY && key !== NARRATOR_KEY) {
      result[voiceId] = key;
    }
  }
  return result;
}

function buildExistingPreview(
  audio: TextboxAudio | undefined,
  voiceToReader: Record<string, string>
): string {
  if (!audio || !audio.chunks || audio.chunks.length === 0) return "";
  return audio.chunks
    .map((c) => {
      const readerKey = voiceToReader[c.voice_id] ?? NARRATOR_KEY;
      return `@${readerKey}: ${c.script}`;
    })
    .join("\n");
}

function buildRows(
  textboxes: SpreadTextbox[],
  editorLang: string,
  readerToVoice: Record<string, string>
): EnhanceRow[] {
  const voiceToReader = buildVoiceToReader(readerToVoice);
  const rows: EnhanceRow[] = [];
  for (const tb of textboxes) {
    const content = getContent(tb, editorLang);
    const text = content?.text?.trim() ?? "";
    if (text === "") continue;
    const existingPreview = buildExistingPreview(content?.audio, voiceToReader);
    rows.push({
      id: tb.id,
      original: text,
      enhanced: existingPreview,
      initialEnhanced: existingPreview,
      existingPreview,
      checked: true,
    });
  }
  return rows;
}

function mapEnhanceErrorCodeToMessage(
  code: EnhanceNarrationErrorCode | undefined,
  fallback: string
): string {
  switch (code) {
    case "VALIDATION":
      return "Invalid input.";
    case "MISSING_NARRATOR":
      return "Narrator missing in readers.";
    case "DUPLICATE_READER_KEY":
      return "Duplicate reader keys.";
    case "LLM_ERROR":
      return "Enhancement service unavailable. Please retry.";
    case "LENGTH_MISMATCH":
      return "Enhancement incomplete. Please retry.";
    case "UNKNOWN_READER":
      return "AI used an unknown reader. Please retry.";
    case "MALFORMED_SCRIPT":
      return "AI output malformed. Please retry.";
    case "INTERNAL":
      return "Unexpected error.";
    case "CONNECTION_ERROR":
      return fallback;
    case "ABORT":
      return "Request cancelled.";
    default:
      return fallback || "Enhancement failed. Please retry.";
  }
}

export function EnhanceSpreadNarrationModal({
  isOpen,
  onClose,
  spreadId,
  textboxes,
  editorLang,
  readers,
  readerToVoice,
  context,
  onApplyEnhancements,
}: EnhanceSpreadNarrationModalProps) {
  const [rows, setRows] = useState<EnhanceRow[]>([]);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setRows(buildRows(textboxes, editorLang, readerToVoice));
    } else {
      abortRef.current?.abort();
    }
  }, [isOpen, spreadId, editorLang, textboxes, readerToVoice]);

  const allChecked = rows.length > 0 && rows.every((r) => r.checked);
  const someChecked = rows.some((r) => r.checked) && !allChecked;
  const selectedCount = useMemo(
    () => rows.filter((r) => r.checked).length,
    [rows]
  );
  const savableRows = useMemo(
    () =>
      rows.filter(
        (r) => r.enhanced.trim() !== "" && r.enhanced !== r.initialEnhanced
      ),
    [rows]
  );
  const hasNarrator = useMemo(
    () => readers.some((r) => r.key === NARRATOR_KEY),
    [readers]
  );
  // Suggestion list = readers whose key resolves to a voice_id. Mirrors voice
  // picker rule (build-voice-options.ts): characters without `voice_setting.voice_id`
  // are skipped. `readerToVoice` is built from exactly that source upstream.
  const suggestableReaders = useMemo(
    () => readers.filter((r) => Boolean(readerToVoice[r.key])),
    [readers, readerToVoice]
  );
  const canEnhance =
    selectedCount > 0 && !isEnhancing && !isSaving && hasNarrator;
  const canSave =
    savableRows.length > 0 && !isEnhancing && !isSaving && hasNarrator;

  const handleToggleRow = useCallback((id: string) => {
    setRows((prev) => {
      const target = prev.find((r) => r.id === id);
      if (!target) return prev;
      const willCheck = !target.checked;
      if (willCheck) {
        const currentSelected = prev.filter((r) => r.checked).length;
        if (currentSelected >= MAX_NARRATIONS_PER_BATCH) {
          toast.error(
            `Cannot select more than ${MAX_NARRATIONS_PER_BATCH} rows.`
          );
          return prev;
        }
      }
      return prev.map((r) => (r.id === id ? { ...r, checked: willCheck } : r));
    });
  }, []);

  const handleEnhancedChange = useCallback((id: string, text: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enhanced: text } : r))
    );
  }, []);

  const handleToggleAll = useCallback(() => {
    setRows((prev) => {
      const wasAllChecked = prev.length > 0 && prev.every((r) => r.checked);
      if (wasAllChecked) {
        return prev.map((r) => ({ ...r, checked: false }));
      }
      if (prev.length <= MAX_NARRATIONS_PER_BATCH) {
        return prev.map((r) => ({ ...r, checked: true }));
      }
      toast.message(`Selected first ${MAX_NARRATIONS_PER_BATCH} rows.`);
      let count = 0;
      return prev.map((r) => {
        if (count < MAX_NARRATIONS_PER_BATCH) {
          count++;
          return { ...r, checked: true };
        }
        return { ...r, checked: false };
      });
    });
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && (isEnhancing || isSaving)) {
        abortRef.current?.abort();
        onClose();
        return;
      }
      if (!next) onClose();
    },
    [isEnhancing, isSaving, onClose]
  );

  const handleEnhance = useCallback(async () => {
    if (!canEnhance) return;
    const selected = rows.filter((r) => r.checked);
    if (selected.length > MAX_NARRATIONS_PER_BATCH) {
      toast.error(`Cannot enhance more than ${MAX_NARRATIONS_PER_BATCH} rows.`);
      return;
    }
    if (selected.some((r) => r.original.length > MAX_NARRATION_CHARS)) {
      toast.error(
        `One or more textboxes exceed ${MAX_NARRATION_CHARS} characters.`
      );
      return;
    }
    const indexToId = selected.map((r) => r.id);
    const narrations = selected.map((r) => r.original);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsEnhancing(true);

    log.info("handleEnhance", "start", {
      count: selected.length,
      lang: editorLang,
      readerCount: readers.length,
      hasContext: Boolean(context),
    });

    try {
      const res = await callEnhanceNarration(
        {
          narrations,
          readers,
          language: editorLang,
          context: context || undefined,
        },
        { signal: ctrl.signal }
      );

      if (ctrl.signal.aborted) return;

      if (!res.success) {
        if (res.errorCode === "ABORT") return;
        log.error("handleEnhance", "failed", {
          errorCode: res.errorCode,
          msg: res.error.slice(0, 100),
        });
        toast.error(mapEnhanceErrorCodeToMessage(res.errorCode, res.error));
        return;
      }

      const scripts = res.data.scripts;
      if (scripts.length !== indexToId.length) {
        log.error("handleEnhance", "length mismatch local", {
          expected: indexToId.length,
          got: scripts.length,
        });
        toast.error("Enhancement incomplete. Please retry.");
        return;
      }

      const enhancedMap = new Map(indexToId.map((id, i) => [id, scripts[i]]));

      setRows((prev) =>
        prev.map((r) => {
          const hit = enhancedMap.get(r.id);
          return hit !== undefined
            ? { ...r, enhanced: hit, checked: false }
            : r;
        })
      );

      log.info("handleEnhance", "success", { applied: scripts.length });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      if (!ctrl.signal.aborted) setIsEnhancing(false);
    }
  }, [canEnhance, rows, editorLang, readers, context]);

  const handleSaveAll = useCallback(() => {
    if (!canSave) return;
    const toSave = savableRows;
    const results: EnhancementResult[] = toSave.map((r) => ({
      id: r.id,
      enhanced_script: r.enhanced,
    }));
    setIsSaving(true);
    log.info("handleSaveAll", "start", { count: toSave.length });
    try {
      onApplyEnhancements({
        spreadId,
        language: editorLang,
        results,
        readerToVoice,
      });
      toast.success(
        `Saved ${toSave.length} narration${toSave.length > 1 ? "s" : ""}.`
      );
      log.info("handleSaveAll", "done", { count: toSave.length });
      setIsSaving(false);
      onClose();
      return;
    } catch (e) {
      log.error("handleSaveAll", "persist failed", {
        msg: String(e).slice(0, 100),
      });
      toast.error("Save failed.");
    }
    setIsSaving(false);
  }, [
    canSave,
    savableRows,
    spreadId,
    editorLang,
    readerToVoice,
    onApplyEnhancements,
    onClose,
  ]);

  useInteractionLayer(
    "modal",
    isOpen
      ? {
          id: "enhance-spread-narration-modal",
          ref: dialogContentRef,
          captureClickOutside: true,
          hotkeys: ["Escape"],
          portalSelectors: [
            "[data-radix-popper-content-wrapper]",
            "[data-radix-select-content]",
            '[role="listbox"]',
          ],
          dropdownSelectors: [
            "[data-radix-select-content]",
            "[data-radix-popover-content]",
            "[data-radix-popper-content-wrapper]",
          ],
          onHotkey: (key) => {
            if (key === "Escape" && !isEnhancing && !isSaving) onClose();
          },
          onClickOutside: () => {
            if (!isEnhancing && !isSaving) onClose();
          },
          onForcePop: () => {
            abortRef.current?.abort();
            setIsEnhancing(false);
            setIsSaving(false);
          },
        }
      : null
  );

  const noRows = rows.length === 0;
  const showEmptyNarrator = !hasNarrator;
  const showEmptyRows = hasNarrator && noRows;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className="sm:max-w-[720px]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Narration
          </DialogTitle>
        </DialogHeader>

        {showEmptyNarrator ? (
          <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <Mic className="h-8 w-8" />
            <p className="text-sm text-center">
              Narrator voice not configured. Set narrator in book settings.
            </p>
          </div>
        ) : showEmptyRows ? (
          <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <Mic className="h-8 w-8" />
            <p className="text-sm text-center">
              No textbox text to narrate. Add text to textboxes first.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-h-[400px] overflow-y-auto border rounded-md">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground w-1/2">
                      Original
                    </th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground w-1/2">
                      Enhanced
                    </th>
                    <th className="px-3 py-2.5 w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = someChecked;
                        }}
                        onChange={handleToggleAll}
                        className={CHECKBOX_CLASS}
                        style={
                          allChecked || someChecked
                            ? { backgroundImage: CHECK_ICON_URL }
                            : undefined
                        }
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => handleToggleRow(row.id)}
                      className="border-b last:border-b-0 border-border/40 hover:bg-muted/50 cursor-pointer"
                    >
                      <td className="px-3 py-4 align-top whitespace-pre-wrap break-words">
                        {row.original}
                      </td>
                      <td className="px-3 py-4 align-top">
                        <EnhancedScriptTextarea
                          value={row.enhanced}
                          onChange={(next) =>
                            handleEnhancedChange(row.id, next)
                          }
                          readers={suggestableReaders}
                          disabled={isEnhancing || isSaving}
                          placeholder={row.original}
                          ariaLabel={`Edit narration for row ${row.id}`}
                        />
                      </td>
                      <td className="px-3 py-4 text-center align-top">
                        <input
                          type="checkbox"
                          aria-label={`Select row ${row.id}`}
                          checked={row.checked}
                          onChange={() => handleToggleRow(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          className={CHECKBOX_CLASS}
                          style={
                            row.checked
                              ? { backgroundImage: CHECK_ICON_URL }
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-center gap-3">
              <Button
                onClick={handleEnhance}
                disabled={!canEnhance}
                aria-label="Enhance narrations"
              >
                {isEnhancing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enhancing...
                  </>
                ) : selectedCount > 0 ? (
                  `Enhance (${selectedCount})`
                ) : (
                  "Enhance"
                )}
              </Button>
              <Button
                variant="secondary"
                onClick={handleSaveAll}
                disabled={!canSave}
                aria-label="Save all enhancements"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : savableRows.length > 0 ? (
                  `Save All (${savableRows.length})`
                ) : (
                  "Save All"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
