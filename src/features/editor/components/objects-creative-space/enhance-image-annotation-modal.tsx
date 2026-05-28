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
import { ImageIcon, Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createLogger } from "@/utils/logger";
import {
  callEnhanceImageAnnotation,
  MAX_ANNOTATION_IMAGES_PER_BATCH,
  MAX_ANNOTATION_SUBJECTS_PER_IMAGE,
  type EnhanceImageAnnotationErrorCode,
} from "@/apis/text-api";

const log = createLogger("UI", "EnhanceImageAnnotationModal");

const MAX_ANNOTATION_CHARS = 2000; // soft counter only — does NOT block Save

const CHECK_ICON_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'><path d='M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3-3a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z'/></svg>\")";

const CHECKBOX_CLASS =
  "cursor-pointer h-[18px] w-[18px] appearance-none rounded-md border border-blue-400 bg-white bg-no-repeat bg-center checked:bg-blue-500 checked:border-blue-500 indeterminate:bg-blue-500 indeterminate:border-blue-500";

// ─── Public contract (parent builds + persists) ───

export interface AnnotationSubject {
  key: string;
  type: "character" | "prop";
  variant_key: string | null;
  name?: string;
  visual_description?: string;
}

export interface AnnotationRowInput {
  imageId: string;
  effectiveUrl: string;
  subjects: AnnotationSubject[];
  existingDescription: string;
}

export interface AnnotationResult {
  imageId: string;
  description: string;
}

export interface ApplyAnnotationsPayload {
  spreadId: string;
  results: AnnotationResult[];
}

export interface EnhanceImageAnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  spreadId: string;
  images: AnnotationRowInput[];
  language: string; // LOCKED = book.original_language
  artStyle?: string;
  // `context` dropped 2026-05-28 — see text-api.ts EnhanceImageAnnotationParams.
  onApplyAnnotations: (payload: ApplyAnnotationsPayload) => void;
}

// ─── Local row state ───

interface AnnotationRow {
  imageId: string;
  effectiveUrl: string;
  thumbnailUrl: string;
  subjects: AnnotationSubject[];
  originalAnnotation: string;
  annotation: string;
  checked: boolean;
  skipped: boolean;
}

function buildRows(images: AnnotationRowInput[]): AnnotationRow[] {
  return images.map((img) => ({
    imageId: img.imageId,
    effectiveUrl: img.effectiveUrl,
    thumbnailUrl: img.effectiveUrl,
    subjects: img.subjects,
    originalAnnotation: img.existingDescription,
    annotation: img.existingDescription,
    checked: img.existingDescription === "",
    skipped: false,
  }));
}

function mapAnnotationErrorToMessage(
  code: EnhanceImageAnnotationErrorCode | undefined,
  fallback: string
): string {
  switch (code) {
    case "VALIDATION":
      return "Invalid input.";
    case "IMAGE_FETCH_ERROR":
      return "Could not load images. Retry?";
    case "LLM_ERROR":
      return "Annotation service unavailable. Retry?";
    case "LENGTH_MISMATCH":
      return "Generation incomplete. Retry?";
    case "INTERNAL":
      return "Unexpected error.";
    case "CONNECTION_ERROR":
      return fallback;
    case "ABORT":
      return "Request cancelled.";
    default:
      return fallback || "Generation failed. Please retry.";
  }
}

export function EnhanceImageAnnotationModal({
  isOpen,
  onClose,
  spreadId,
  images,
  language,
  artStyle,
  onApplyAnnotations,
}: EnhanceImageAnnotationModalProps) {
  const [rows, setRows] = useState<AnnotationRow[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  // Rebuild rows on open / spread / images change (sync external prop → local editable state).
  useEffect(() => {
    if (isOpen) {
      if (images.length > MAX_ANNOTATION_IMAGES_PER_BATCH) {
        log.warn("rebuildRows", "image count exceeds batch cap", {
          count: images.length,
          cap: MAX_ANNOTATION_IMAGES_PER_BATCH,
        });
      }
      setRows(buildRows(images));
      // Reset transient flags on (re)open so a prior aborted generate/save
      // can't leave the buttons stuck disabled.
      setIsGenerating(false);
      setIsSaving(false);
    } else {
      abortRef.current?.abort();
    }
  }, [isOpen, spreadId, images]);

  // ─── Derived (render body — no set-state-in-effect) ───
  const allChecked = rows.length > 0 && rows.every((r) => r.checked);
  const someChecked = rows.some((r) => r.checked) && !allChecked;
  const selectedCount = useMemo(
    () => rows.filter((r) => r.checked).length,
    [rows]
  );
  const dirtyRows = useMemo(
    () =>
      rows.filter(
        (r) => r.annotation.trim() !== r.originalAnnotation.trim()
      ),
    [rows]
  );
  const canGenerate = selectedCount > 0 && !isGenerating && !isSaving;
  const canSave = dirtyRows.length > 0 && !isGenerating && !isSaving;

  const handleToggleRow = useCallback((imageId: string) => {
    setRows((prev) => {
      const target = prev.find((r) => r.imageId === imageId);
      if (!target) return prev;
      const willCheck = !target.checked;
      if (willCheck) {
        const currentSelected = prev.filter((r) => r.checked).length;
        if (currentSelected >= MAX_ANNOTATION_IMAGES_PER_BATCH) {
          toast.error(
            `Maximum ${MAX_ANNOTATION_IMAGES_PER_BATCH} images per batch.`
          );
          return prev;
        }
      }
      return prev.map((r) =>
        r.imageId === imageId ? { ...r, checked: willCheck } : r
      );
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setRows((prev) => {
      const wasAllChecked = prev.length > 0 && prev.every((r) => r.checked);
      if (wasAllChecked) {
        return prev.map((r) => ({ ...r, checked: false }));
      }
      if (prev.length <= MAX_ANNOTATION_IMAGES_PER_BATCH) {
        return prev.map((r) => ({ ...r, checked: true }));
      }
      toast.message(
        `Selected first ${MAX_ANNOTATION_IMAGES_PER_BATCH} images (batch limit).`
      );
      return prev.map((r, i) => ({
        ...r,
        checked: i < MAX_ANNOTATION_IMAGES_PER_BATCH,
      }));
    });
  }, []);

  const handleEditAnnotation = useCallback((imageId: string, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.imageId === imageId ? { ...r, annotation: value, skipped: false } : r
      )
    );
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && (isGenerating || isSaving)) {
        abortRef.current?.abort();
        onClose();
        return;
      }
      if (!next) onClose();
    },
    [isGenerating, isSaving, onClose]
  );

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    const selected = rows.filter((r) => r.checked);
    if (selected.length === 0) return;
    if (selected.length > MAX_ANNOTATION_IMAGES_PER_BATCH) {
      toast.error(
        `Cannot generate more than ${MAX_ANNOTATION_IMAGES_PER_BATCH} at once.`
      );
      return;
    }

    const indexToId = selected.map((r) => r.imageId);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsGenerating(true);

    log.info("handleGenerate", "start", {
      count: selected.length,
      language,
      hasArtStyle: Boolean(artStyle),
    });

    try {
      const res = await callEnhanceImageAnnotation(
        {
          images: selected.map((r, i) => ({
            index: i,
            media_url: r.effectiveUrl,
            subjects: r.subjects.slice(0, MAX_ANNOTATION_SUBJECTS_PER_IMAGE),
          })),
          language,
          art_style: artStyle || undefined,
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
        toast.error(mapAnnotationErrorToMessage(res.errorCode, res.error));
        return;
      }

      const annotations = res.data.annotations;
      const skipped = res.meta?.skipped ?? [];

      // Map index → image.id; ignore out-of-range index (defensive — §4.7).
      const annById = new Map<string, string>();
      let emptyCount = 0;
      for (const a of annotations) {
        const id = indexToId[a.index];
        if (id === undefined) {
          log.warn("handleGenerate", "annotation index out of range", {
            index: a.index,
          });
          continue;
        }
        if (a.description === "") emptyCount += 1;
        annById.set(id, a.description);
      }
      const skipById = new Set<string>();
      for (const s of skipped) {
        const id = indexToId[s.index];
        if (id === undefined) {
          log.warn("handleGenerate", "skipped index out of range", {
            index: s.index,
          });
          continue;
        }
        skipById.add(id);
      }

      setRows((prev) =>
        prev.map((r) => {
          if (annById.has(r.imageId)) {
            return {
              ...r,
              annotation: annById.get(r.imageId) ?? "",
              checked: false,
              skipped: false,
            };
          }
          if (skipById.has(r.imageId)) {
            return { ...r, skipped: true };
          }
          return r;
        })
      );

      if (skipped.length > 0) {
        log.warn("handleGenerate", "partial skipped", { count: skipped.length });
        toast.warning(
          `${skipped.length} image${skipped.length > 1 ? "s" : ""} skipped (fetch failed).`
        );
      }
      if (emptyCount > 0) {
        log.warn("handleGenerate", "empty descriptions returned", {
          count: emptyCount,
        });
      }

      log.info("handleGenerate", "success", {
        applied: annById.size,
        skipped: skipById.size,
      });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      if (!ctrl.signal.aborted) setIsGenerating(false);
    }
  }, [canGenerate, rows, language, artStyle]);

  const handleSave = useCallback(() => {
    if (!canSave) return;
    const toSave = dirtyRows;
    if (toSave.length === 0) return;
    const results: AnnotationResult[] = toSave.map((r) => ({
      imageId: r.imageId,
      description: r.annotation.trim(),
    }));
    setIsSaving(true);
    log.info("handleSave", "start", { count: results.length });
    try {
      onApplyAnnotations({ spreadId, results });
      // Update baseline so saved rows clear dirty (keep edited value).
      const saved = new Set(results.map((r) => r.imageId));
      setRows((prev) =>
        prev.map((r) =>
          saved.has(r.imageId)
            ? { ...r, originalAnnotation: r.annotation.trim() }
            : r
        )
      );
      toast.success(
        `Saved ${results.length} annotation${results.length > 1 ? "s" : ""}.`
      );
      log.info("handleSave", "done", { count: results.length });
    } catch (e) {
      log.error("handleSave", "persist failed", {
        msg: String(e).slice(0, 100),
      });
      toast.error("Save failed.");
    } finally {
      setIsSaving(false);
    }
  }, [canSave, dirtyRows, spreadId, onApplyAnnotations]);

  useInteractionLayer(
    "modal",
    isOpen
      ? {
          id: "enhance-image-annotation-modal",
          ref: dialogContentRef,
          captureClickOutside: true,
          hotkeys: ["Escape"],
          onHotkey: (key) => {
            if (key === "Escape" && !isGenerating && !isSaving) onClose();
          },
          onClickOutside: () => {
            if (!isGenerating && !isSaving) onClose();
          },
          onForcePop: () => {
            abortRef.current?.abort();
            setIsGenerating(false);
            setIsSaving(false);
          },
        }
      : null
  );

  const noRows = rows.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className="sm:max-w-[840px]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle
            id="enhance-annotation-modal-title"
            className="flex items-center gap-2"
          >
            <Sparkles className="h-5 w-5" />
            Annotations
          </DialogTitle>
        </DialogHeader>

        {noRows ? (
          <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <ImageIcon className="h-8 w-8" aria-hidden />
            <p className="text-sm text-center">
              No tagged images to annotate. Tag images with characters or props
              first.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-h-[520px] overflow-y-auto border rounded-lg">
              <table
                className="w-full border-collapse text-sm"
                aria-label="Image annotation rows"
              >
                <thead className="sticky top-0 bg-muted border-b border-border z-10">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground w-20">
                      Thumbnail
                    </th>
                    <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground w-[180px]">
                      Object
                    </th>
                    <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                      Annotation
                    </th>
                    <th className="px-4 py-2.5 w-20 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          Select all
                        </span>
                        <input
                          type="checkbox"
                          aria-label="Select all rows"
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
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.imageId}
                      data-checked={row.checked}
                      data-skipped={row.skipped}
                      className={
                        "border-b last:border-b-0 border-border/40 hover:bg-muted/40" +
                        (row.checked ? " bg-accent/10" : "") +
                        (row.skipped ? " border-l-2 border-l-amber-500" : "")
                      }
                    >
                      <td
                        className="px-4 py-3 align-top cursor-pointer"
                        onClick={() => handleToggleRow(row.imageId)}
                      >
                        <Thumbnail src={row.thumbnailUrl} />
                      </td>
                      <td
                        className="px-4 py-3 align-top cursor-pointer"
                        onClick={() => handleToggleRow(row.imageId)}
                      >
                        <SubjectList subjects={row.subjects} />
                      </td>
                      <td
                        className="px-4 py-3 align-top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Textarea
                          value={row.annotation}
                          onChange={(e) =>
                            handleEditAnnotation(row.imageId, e.target.value)
                          }
                          disabled={isGenerating || isSaving}
                          placeholder="Describe what each object is doing in this scene…"
                          aria-label={`Annotation for image ${row.imageId}`}
                          aria-multiline="true"
                          className="min-h-[72px] max-h-[160px] resize-y whitespace-pre-wrap"
                        />
                        <div className="mt-1 flex items-center justify-between gap-2">
                          {row.skipped ? (
                            <span className="text-xs text-amber-600">
                              ⚠ Fetch failed — not generated
                            </span>
                          ) : (
                            <span />
                          )}
                          <span
                            className={
                              "text-xs " +
                              (row.annotation.length > MAX_ANNOTATION_CHARS
                                ? "text-amber-600"
                                : "text-muted-foreground")
                            }
                          >
                            {row.annotation.length}/{MAX_ANNOTATION_CHARS}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center align-top">
                        <input
                          type="checkbox"
                          aria-label="Toggle image row"
                          checked={row.checked}
                          onChange={() => handleToggleRow(row.imageId)}
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
                onClick={handleGenerate}
                disabled={!canGenerate}
                aria-label={`Generate annotations for ${selectedCount} selected images`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {selectedCount > 0 ? `Generate (${selectedCount})` : "Generate"}
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                onClick={handleSave}
                disabled={!canSave}
                aria-label={`Save ${dirtyRows.length} changed annotations`}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {dirtyRows.length > 0
                      ? `Save (${dirtyRows.length})`
                      : "Save"}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline sections ───

function Thumbnail({ src }: { src: string }) {
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) {
    return (
      <div
        className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center"
        aria-hidden
      >
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-16 w-16 rounded-md border object-cover"
      onError={() => setHasError(true)}
    />
  );
}

function SubjectList({ subjects }: { subjects: AnnotationSubject[] }) {
  if (subjects.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {subjects.map((s, i) => {
        const dangling = !s.name;
        const showVariant = s.variant_key !== null;
        return (
          <div
            key={`${s.key}-${s.variant_key ?? "base"}-${i}`}
            className="flex items-center gap-1.5 text-sm"
          >
            <span
              className={dangling ? "text-muted-foreground italic" : ""}
              title={dangling ? "Object not found" : undefined}
            >
              {s.name ?? `@${s.key}`}
            </span>
            {showVariant && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {s.variant_key}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
