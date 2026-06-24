// use-object-modals.ts - Modal state management for generate/edit/extract/editAudio modals
// spreadId is captured at open time to prevent stale-spread updates if selection changes while modal is open
//
// Toolbar unify (matrix): the Objects image footer now has SEPARATE Generate and Edit buttons.
//   • generate slice → GenerateImageModal (upload-only, object.generate)
//   • edit slice     → RetouchEditImageModal (object.edit)
// The crop slice is gone — box-crop now lives in the Extract `get_object` tab.

import { useState, useCallback } from "react";
import { createLogger } from "@/utils/logger";
import { useSnapshotActions } from "@/stores/snapshot-store/selectors";
import type { ExtractTabKey } from "@/features/editor/components/shared-components";
import type {
  SpreadImage,
  SpreadAudio,
  SpreadAutoAudio,
} from "@/types/canvas-types";

const log = createLogger("Editor", "useObjectModals");

type SnapshotActions = ReturnType<typeof useSnapshotActions>;

/** Edit-audio modal handles both regular audio and auto_audio items. The `kind`
 *  field discriminates which slice action to dispatch on completion. */
export type EditAudioKind = "audio" | "auto_audio";

export interface UseObjectModalsReturn {
  /** GenerateImageModal (upload-only in Objects). */
  generate: { open: boolean; imageId: string | null; spreadId: string };
  /** RetouchEditImageModal (Inpaint / Outpaint / Upscale / Remove BG / Erasor). */
  edit: { open: boolean; imageId: string | null; spreadId: string };
  /** Consolidated Extract modal (Objects / Segments / Layers / Background). */
  extract: {
    open: boolean;
    image: SpreadImage | null;
    spreadId: string;
    initialTab: ExtractTabKey;
  };
  editAudio: {
    open: boolean;
    item: SpreadAudio | SpreadAutoAudio | null;
    spreadId: string;
    kind: EditAudioKind | null;
  };

  openGenerate: (img: SpreadImage) => void;
  closeGenerate: (open: boolean) => void;
  openEdit: (img: SpreadImage) => void;
  closeEdit: (open: boolean) => void;
  openExtract: (img: SpreadImage, initialTab?: ExtractTabKey) => void;
  closeExtract: (open: boolean) => void;
  openEditAudio: (
    item: SpreadAudio | SpreadAutoAudio,
    kind: EditAudioKind
  ) => void;
  closeEditAudio: () => void;
  handleEditAudioComplete: (result: {
    mediaUrl: string;
    description: string;
  }) => void;
}

export function useObjectModals(
  selectedSpreadId: string,
  actions: SnapshotActions
): UseObjectModalsReturn {
  // Generate image modal (upload-only)
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateImageId, setGenerateImageId] = useState<string | null>(null);
  const [generateSpreadId, setGenerateSpreadId] = useState<string>("");

  // Edit image modal (RetouchEditImageModal)
  const [editOpen, setEditOpen] = useState(false);
  const [editImageId, setEditImageId] = useState<string | null>(null);
  const [editSpreadId, setEditSpreadId] = useState<string>("");

  // Extract image modal (consolidated Objects + Segments + Layers + Background)
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractImage, setExtractImage] = useState<SpreadImage | null>(null);
  const [extractSpreadId, setExtractSpreadId] = useState<string>("");
  const [extractInitialTab, setExtractInitialTab] =
    useState<ExtractTabKey>("get_object");

  // Edit audio modal — covers audio + auto_audio (discriminated via kind)
  const [editAudioOpen, setEditAudioOpen] = useState(false);
  const [editAudioItem, setEditAudioItem] = useState<
    SpreadAudio | SpreadAutoAudio | null
  >(null);
  const [editAudioSpreadId, setEditAudioSpreadId] = useState<string>("");
  const [editAudioKind, setEditAudioKind] = useState<EditAudioKind | null>(
    null
  );

  // CRITICAL: deps include selectedSpreadId to capture it at open time
  const openGenerate = useCallback(
    (img: SpreadImage) => {
      setGenerateImageId(img.id);
      setGenerateSpreadId(selectedSpreadId);
      setGenerateOpen(true);
    },
    [selectedSpreadId]
  );

  const closeGenerate = useCallback((open: boolean) => {
    setGenerateOpen(open);
    if (!open) setGenerateImageId(null);
  }, []);

  const openEdit = useCallback(
    (img: SpreadImage) => {
      setEditImageId(img.id);
      setEditSpreadId(selectedSpreadId);
      setEditOpen(true);
    },
    [selectedSpreadId]
  );

  const closeEdit = useCallback((open: boolean) => {
    setEditOpen(open);
    if (!open) setEditImageId(null);
  }, []);

  const openExtract = useCallback(
    // Default entry (toolbar "Extract") opens the Objects tab; the split entry passes
    // "layering" explicitly. Segments is no longer the default landing tab.
    (img: SpreadImage, initialTab: ExtractTabKey = "get_object") => {
      setExtractImage(img);
      setExtractSpreadId(selectedSpreadId);
      setExtractInitialTab(initialTab);
      setExtractOpen(true);
    },
    [selectedSpreadId]
  );

  const closeExtract = useCallback((open: boolean) => {
    setExtractOpen(open);
    if (!open) setExtractImage(null);
  }, []);

  const openEditAudio = useCallback(
    (item: SpreadAudio | SpreadAutoAudio, kind: EditAudioKind) => {
      setEditAudioItem(item);
      setEditAudioSpreadId(selectedSpreadId);
      setEditAudioKind(kind);
      setEditAudioOpen(true);
    },
    [selectedSpreadId]
  );

  const closeEditAudio = useCallback(() => {
    setEditAudioOpen(false);
    setEditAudioItem(null);
    setEditAudioKind(null);
  }, []);

  const handleEditAudioComplete = useCallback(
    (result: { mediaUrl: string; description: string }) => {
      if (!editAudioItem || !editAudioSpreadId || !editAudioKind) {
        log.warn("handleEditAudioComplete", "missing state, skip", {
          hasItem: !!editAudioItem,
          spreadId: editAudioSpreadId,
          kind: editAudioKind,
        });
        return;
      }
      const patch = {
        media_url: result.mediaUrl,
        description: result.description,
      };
      switch (editAudioKind) {
        case "audio":
          actions.updateRetouchAudio(
            editAudioSpreadId,
            editAudioItem.id,
            patch
          );
          log.info("handleEditAudioComplete", "audio saved", {
            audioId: editAudioItem.id,
            spreadId: editAudioSpreadId,
            mediaUrl: result.mediaUrl,
            descLen: result.description.length,
          });
          break;
        case "auto_audio":
          actions.updateRetouchAutoAudio(
            editAudioSpreadId,
            editAudioItem.id,
            patch
          );
          log.info("handleEditAudioComplete", "auto_audio saved", {
            autoAudioId: editAudioItem.id,
            spreadId: editAudioSpreadId,
            mediaUrl: result.mediaUrl,
            descLen: result.description.length,
          });
          break;
      }
      setEditAudioOpen(false);
      setEditAudioItem(null);
      setEditAudioKind(null);
    },
    [editAudioItem, editAudioSpreadId, editAudioKind, actions]
  );

  return {
    generate: { open: generateOpen, imageId: generateImageId, spreadId: generateSpreadId },
    edit: { open: editOpen, imageId: editImageId, spreadId: editSpreadId },
    extract: {
      open: extractOpen,
      image: extractImage,
      spreadId: extractSpreadId,
      initialTab: extractInitialTab,
    },
    editAudio: {
      open: editAudioOpen,
      item: editAudioItem,
      spreadId: editAudioSpreadId,
      kind: editAudioKind,
    },
    openGenerate,
    closeGenerate,
    openEdit,
    closeEdit,
    openExtract,
    closeExtract,
    openEditAudio,
    closeEditAudio,
    handleEditAudioComplete,
  };
}
