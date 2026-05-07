// create-composite-modal.tsx - Modal for creating a SpreadComposite from 2..3 image/auto_pic.
// User flow: pick name → check candidate rows → modal auto-assigns first free edition slot
// + auto-opens edition popover for fine-tuning. Submit dispatches addRetouchComposite atomically.
"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Image as ImageIcon, Sparkles, Layers } from "lucide-react";
import { cn } from "@/utils/utils";
import {
  useRetouchSpreadById,
  useSnapshotActions,
} from "@/stores/snapshot-store/selectors";
import { createLogger } from "@/utils/logger";
import { EDITION_LABEL } from "./utils/composite-list-helpers";
import {
  buildCandidates,
  getDisabledEditionsForRow,
  isRowDisabled,
  suggestInitialEdition,
  expandToVariants,
  nextDefaultName,
  nextZIndex,
  EDITION_PRIORITY,
  type CompositeCandidate,
  type CompositeSelections,
} from "./utils/composite-modal-helpers";
import type { EditionTag } from "@/types/spread-types";

const log = createLogger("Editor", "CreateCompositeModal");

const CHECKBOX_CLASS =
  "cursor-pointer h-[18px] w-[18px] appearance-none rounded-md border border-blue-400 bg-white bg-no-repeat bg-center checked:bg-blue-500 checked:border-blue-500 disabled:cursor-not-allowed disabled:opacity-40";

const CHECK_ICON_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'><path d='M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3-3a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z'/></svg>\")";

// === Props ===

export interface CreateCompositeModalProps {
  open: boolean;
  spreadId: string;
  onClose: () => void;
  onCreated?: (compositeId: string) => void;
}

// === Helpers (UI-only) ===

/** Label shown on the edition multi-select trigger button. */
function editionTriggerLabel(eds: EditionTag[]): string {
  if (eds.length === 0) return "Edition";
  if (eds.length === 1) return EDITION_LABEL[eds[0]];
  return `${eds.length} selected`;
}

// === Subcomponent: candidate row ===

interface CompositeCandidateRowProps {
  candidate: CompositeCandidate;
  selectedEditions: EditionTag[];
  disabledEditions: Set<EditionTag>;
  disabledRow: boolean;
  popoverOpen: boolean;
  onCheckboxToggle: () => void;
  onEditionToggle: (edition: EditionTag) => void;
  onPopoverOpenChange: (open: boolean) => void;
}

function CompositeCandidateRow({
  candidate,
  selectedEditions,
  disabledEditions,
  disabledRow,
  popoverOpen,
  onCheckboxToggle,
  onEditionToggle,
  onPopoverOpenChange,
}: CompositeCandidateRowProps) {
  const isChecked = selectedEditions.length > 0;
  const TypeIcon = candidate.type === "image" ? ImageIcon : Sparkles;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 border-b last:border-b-0 border-border/40",
        disabledRow && "opacity-50 cursor-not-allowed"
      )}
      aria-disabled={disabledRow}
    >
      <input
        type="checkbox"
        aria-label={`Select ${candidate.title}`}
        checked={isChecked}
        disabled={disabledRow}
        onChange={onCheckboxToggle}
        className={CHECKBOX_CLASS}
        style={isChecked ? { backgroundImage: CHECK_ICON_URL } : undefined}
      />
      <TypeIcon className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm truncate" title={candidate.title}>
        {candidate.title}
      </span>
      <Popover
        open={popoverOpen && !disabledRow}
        onOpenChange={onPopoverOpenChange}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabledRow || !isChecked}
            aria-label={`Edition for ${candidate.title}`}
            className="min-w-[100px] justify-between"
          >
            {editionTriggerLabel(selectedEditions)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1" align="end" sideOffset={4}>
          <div className="space-y-0.5 text-sm">
            {EDITION_PRIORITY.map((e) => {
              const checked = selectedEditions.includes(e);
              const disabled = disabledEditions.has(e) && !checked;
              return (
                <button
                  key={e}
                  type="button"
                  disabled={disabled}
                  onClick={() => onEditionToggle(e)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left",
                    "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40",
                    checked && "bg-muted"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className={CHECKBOX_CLASS}
                    style={checked ? { backgroundImage: CHECK_ICON_URL } : undefined}
                  />
                  <span>{EDITION_LABEL[e]}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// === Main modal component ===

export function CreateCompositeModal({
  open,
  spreadId,
  onClose,
  onCreated,
}: CreateCompositeModalProps) {
  const spread = useRetouchSpreadById(spreadId);
  const actions = useSnapshotActions();

  // Local state.
  const [name, setName] = useState("");
  const [selections, setSelections] = useState<CompositeSelections>({});
  const [openPopoverFor, setOpenPopoverFor] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Derive candidates fresh each render (cheap; spread changes rarely).
  const candidates = useMemo(() => buildCandidates(spread), [spread]);

  // Reset draft state every time the modal opens (discard prior draft).
  useEffect(() => {
    if (!open) return;
    const defaultName = nextDefaultName(spread?.composites);
    log.debug("useEffect:open", "reset draft", {
      spreadId,
      defaultName,
      candidateCount: candidates.length,
    });
    setName(defaultName);
    setSelections({});
    setOpenPopoverFor(null);
  }, [open, spreadId, spread?.composites, candidates.length]);

  // Validation: name + ≥ 2 selected items + every selected has ≥ 1 edition.
  const canCreate = useMemo(() => {
    if (name.trim() === "") return false;
    const ids = Object.keys(selections);
    if (ids.length < 2) return false;
    return ids.every((id) => (selections[id]?.length ?? 0) > 0);
  }, [name, selections]);

  // === Handlers ===

  const handleToggleCheckbox = useCallback(
    (itemId: string) => {
      setSelections((prev) => {
        const current = prev[itemId];
        // Already checked → uncheck (drop key, clear all editions).
        if (current && current.length > 0) {
          log.debug("handleToggleCheckbox", "uncheck row", { itemId });
          const next = { ...prev };
          delete next[itemId];
          return next;
        }
        // Not yet checked → auto-assign first free edition slot.
        const initial = suggestInitialEdition(itemId, prev);
        if (initial === null) {
          log.warn("handleToggleCheckbox", "slot pool exhausted; no-op", {
            itemId,
          });
          return prev;
        }
        log.debug("handleToggleCheckbox", "check row + auto-assign", {
          itemId,
          edition: initial,
        });
        return { ...prev, [itemId]: [initial] };
      });
      // Auto-open popover when a row gets checked (UX flow per spec video).
      setOpenPopoverFor((prevOpen) => {
        const wasChecked = (selections[itemId]?.length ?? 0) > 0;
        if (wasChecked) {
          // Was uncheck → close popover if it was open for this row.
          return prevOpen === itemId ? null : prevOpen;
        }
        // Was check → open popover for this row.
        return itemId;
      });
    },
    [selections]
  );

  const handleToggleEdition = useCallback(
    (itemId: string, edition: EditionTag) => {
      setSelections((prev) => {
        const current = prev[itemId] ?? [];
        if (current.includes(edition)) {
          // Toggle off — empty array stays (blocks Create button).
          const next = current.filter((x) => x !== edition);
          log.debug("handleToggleEdition", "remove edition", {
            itemId,
            edition,
            remaining: next,
          });
          return { ...prev, [itemId]: next };
        }
        // Add edition — but block if claimed by another row.
        const taken = getDisabledEditionsForRow(itemId, prev);
        if (taken.has(edition)) {
          log.debug("handleToggleEdition", "edition taken by other row; skip", {
            itemId,
            edition,
          });
          return prev;
        }
        log.debug("handleToggleEdition", "add edition", { itemId, edition });
        return { ...prev, [itemId]: [...current, edition] };
      });
    },
    []
  );

  const handlePopoverOpenChange = useCallback(
    (itemId: string, isOpen: boolean) => {
      setOpenPopoverFor(isOpen ? itemId : null);
    },
    []
  );

  const handleCreate = useCallback(() => {
    if (!canCreate) {
      log.debug("handleCreate", "blocked by validation", {
        nameEmpty: name.trim() === "",
        selectedCount: Object.keys(selections).length,
      });
      return;
    }
    const newId = crypto.randomUUID();
    const variants = expandToVariants(selections, candidates);
    const z = nextZIndex(spread);

    log.info("handleCreate", "creating composite", {
      spreadId,
      compositeId: newId,
      title: name.trim(),
      variantCount: variants.length,
      zIndex: z,
    });

    actions.addRetouchComposite(spreadId, {
      id: newId,
      title: name.trim(),
      "z-index": z,
      variants,
      player_visible: true,
      editor_visible: true,
    });

    onCreated?.(newId);
    onClose();
  }, [canCreate, name, selections, candidates, spread, spreadId, actions, onCreated, onClose]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        log.debug("handleOpenChange", "modal closed (cancel/esc/x)");
        onClose();
      }
    },
    [onClose]
  );

  // Enter in name field → submit when valid.
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && canCreate) {
        e.preventDefault();
        handleCreate();
      }
    },
    [canCreate, handleCreate]
  );

  const isEmpty = candidates.length === 0;
  const selectedCount = Object.keys(selections).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Create Composite
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name input */}
          <div className="space-y-1.5">
            <label
              htmlFor="composite-name"
              className="text-sm font-medium block"
            >
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="composite-name"
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleNameKeyDown}
              placeholder="e.g. group 1"
              aria-required="true"
            />
          </div>

          {/* Candidate list */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">
              Sub-items{" "}
              <span className="text-muted-foreground font-normal">
                ({selectedCount} selected — min 2)
              </span>
            </p>
            {isEmpty ? (
              <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
                Add images first to create a composite. Min 2 free
                images/auto_pics required.
              </div>
            ) : (
              <div className="border rounded-md max-h-[420px] overflow-y-auto">
                {candidates.map((candidate) => {
                  const selected = selections[candidate.id] ?? [];
                  const disabled = isRowDisabled(candidate.id, selections);
                  const disabledEds = getDisabledEditionsForRow(
                    candidate.id,
                    selections
                  );
                  return (
                    <CompositeCandidateRow
                      key={candidate.id}
                      candidate={candidate}
                      selectedEditions={selected}
                      disabledEditions={disabledEds}
                      disabledRow={disabled}
                      popoverOpen={openPopoverFor === candidate.id}
                      onCheckboxToggle={() => handleToggleCheckbox(candidate.id)}
                      onEditionToggle={(e) =>
                        handleToggleEdition(candidate.id, e)
                      }
                      onPopoverOpenChange={(o) =>
                        handlePopoverOpenChange(candidate.id, o)
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            title={
              canCreate
                ? undefined
                : "Enter a name and select at least 2 items with editions"
            }
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateCompositeModal;
