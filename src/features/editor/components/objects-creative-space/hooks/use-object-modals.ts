// use-object-modals.ts - Modal state management for generate/split/crop/cropAudio modals
// spreadId is captured at open time to prevent stale-spread updates if selection changes while modal is open

import { useState, useCallback } from "react";
import { createLogger } from "@/utils/logger";
import { useSnapshotActions } from "@/stores/snapshot-store/selectors";
import type {
  SpreadImage,
  SpreadAudio,
  SpreadAutoAudio,
} from "@/types/canvas-types";

const log = createLogger("Editor", "useObjectModals");

type SnapshotActions = ReturnType<typeof useSnapshotActions>;

/** Crop-audio modal handles both regular audio and auto_audio items. The `kind`
 *  field discriminates which slice action to dispatch on completion. */
export type CropAudioKind = "audio" | "auto_audio";

export interface UseObjectModalsReturn {
  generate: { open: boolean; imageId: string | null; spreadId: string };
  split: { open: boolean; image: SpreadImage | null; spreadId: string };
  crop: { open: boolean; image: SpreadImage | null; spreadId: string };
  segment: { open: boolean; image: SpreadImage | null; spreadId: string };
  cropAudio: {
    open: boolean;
    item: SpreadAudio | SpreadAutoAudio | null;
    spreadId: string;
    kind: CropAudioKind | null;
  };

  openGenerate: (img: SpreadImage) => void;
  closeGenerate: (open: boolean) => void;
  openSplit: (img: SpreadImage) => void;
  closeSplit: (open: boolean) => void;
  openCrop: (img: SpreadImage) => void;
  closeCrop: (open: boolean) => void;
  openSegment: (img: SpreadImage) => void;
  closeSegment: (open: boolean) => void;
  openCropAudio: (
    item: SpreadAudio | SpreadAutoAudio,
    kind: CropAudioKind
  ) => void;
  closeCropAudio: () => void;
  handleCropAudioComplete: (newMediaUrl: string) => void;
}

export function useObjectModals(
  selectedSpreadId: string,
  actions: SnapshotActions
): UseObjectModalsReturn {
  // Generate image modal
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateImageId, setGenerateImageId] = useState<string | null>(null);
  const [generateSpreadId, setGenerateSpreadId] = useState<string>("");

  // Split image modal
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitImage, setSplitImage] = useState<SpreadImage | null>(null);
  const [splitSpreadId, setSplitSpreadId] = useState<string>("");

  // Crop image modal
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImage, setCropImage] = useState<SpreadImage | null>(null);
  const [cropSpreadId, setCropSpreadId] = useState<string>("");

  // Segment image modal
  const [segmentOpen, setSegmentOpen] = useState(false);
  const [segmentImage, setSegmentImage] = useState<SpreadImage | null>(null);
  const [segmentSpreadId, setSegmentSpreadId] = useState<string>("");

  // Crop audio modal — covers audio + auto_audio (discriminated via kind)
  const [cropAudioOpen, setCropAudioOpen] = useState(false);
  const [cropAudioItem, setCropAudioItem] = useState<
    SpreadAudio | SpreadAutoAudio | null
  >(null);
  const [cropAudioSpreadId, setCropAudioSpreadId] = useState<string>("");
  const [cropAudioKind, setCropAudioKind] = useState<CropAudioKind | null>(
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

  const openSplit = useCallback(
    (img: SpreadImage) => {
      setSplitImage(img);
      setSplitSpreadId(selectedSpreadId);
      setSplitOpen(true);
    },
    [selectedSpreadId]
  );

  const closeSplit = useCallback((open: boolean) => {
    setSplitOpen(open);
    if (!open) setSplitImage(null);
  }, []);

  const openCrop = useCallback(
    (img: SpreadImage) => {
      setCropImage(img);
      setCropSpreadId(selectedSpreadId);
      setCropOpen(true);
    },
    [selectedSpreadId]
  );

  const closeCrop = useCallback((open: boolean) => {
    setCropOpen(open);
    if (!open) setCropImage(null);
  }, []);

  const openSegment = useCallback(
    (img: SpreadImage) => {
      setSegmentImage(img);
      setSegmentSpreadId(selectedSpreadId);
      setSegmentOpen(true);
    },
    [selectedSpreadId]
  );

  const closeSegment = useCallback((open: boolean) => {
    setSegmentOpen(open);
    if (!open) setSegmentImage(null);
  }, []);

  const openCropAudio = useCallback(
    (item: SpreadAudio | SpreadAutoAudio, kind: CropAudioKind) => {
      setCropAudioItem(item);
      setCropAudioSpreadId(selectedSpreadId);
      setCropAudioKind(kind);
      setCropAudioOpen(true);
    },
    [selectedSpreadId]
  );

  const closeCropAudio = useCallback(() => {
    setCropAudioOpen(false);
    setCropAudioItem(null);
    setCropAudioKind(null);
  }, []);

  const handleCropAudioComplete = useCallback(
    (newMediaUrl: string) => {
      if (!cropAudioItem || !cropAudioSpreadId || !cropAudioKind) {
        log.warn("handleCropAudioComplete", "missing state, skip", {
          hasItem: !!cropAudioItem,
          spreadId: cropAudioSpreadId,
          kind: cropAudioKind,
        });
        return;
      }
      switch (cropAudioKind) {
        case "audio":
          actions.updateRetouchAudio(cropAudioSpreadId, cropAudioItem.id, {
            media_url: newMediaUrl,
          });
          log.info("handleCropAudioComplete", "audio cropped", {
            audioId: cropAudioItem.id,
            spreadId: cropAudioSpreadId,
            newMediaUrl,
          });
          break;
        case "auto_audio":
          actions.updateRetouchAutoAudio(
            cropAudioSpreadId,
            cropAudioItem.id,
            { media_url: newMediaUrl }
          );
          log.info("handleCropAudioComplete", "auto_audio cropped", {
            autoAudioId: cropAudioItem.id,
            spreadId: cropAudioSpreadId,
            newMediaUrl,
          });
          break;
      }
      setCropAudioOpen(false);
      setCropAudioItem(null);
      setCropAudioKind(null);
    },
    [cropAudioItem, cropAudioSpreadId, cropAudioKind, actions]
  );

  return {
    generate: { open: generateOpen, imageId: generateImageId, spreadId: generateSpreadId },
    split: { open: splitOpen, image: splitImage, spreadId: splitSpreadId },
    crop: { open: cropOpen, image: cropImage, spreadId: cropSpreadId },
    segment: { open: segmentOpen, image: segmentImage, spreadId: segmentSpreadId },
    cropAudio: {
      open: cropAudioOpen,
      item: cropAudioItem,
      spreadId: cropAudioSpreadId,
      kind: cropAudioKind,
    },
    openGenerate,
    closeGenerate,
    openSplit,
    closeSplit,
    openCrop,
    closeCrop,
    openSegment,
    closeSegment,
    openCropAudio,
    closeCropAudio,
    handleCropAudioComplete,
  };
}
