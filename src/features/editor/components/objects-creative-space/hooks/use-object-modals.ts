// use-object-modals.ts - Modal state management for generate/split/crop/cropAudio modals
// spreadId is captured at open time to prevent stale-spread updates if selection changes while modal is open

import { useState, useCallback } from "react";
import { createLogger } from "@/utils/logger";
import { useSnapshotActions } from "@/stores/snapshot-store/selectors";
import type { SpreadImage, SpreadAudio } from "@/types/canvas-types";

const log = createLogger("Editor", "useObjectModals");

type SnapshotActions = ReturnType<typeof useSnapshotActions>;

export interface UseObjectModalsReturn {
  generate: { open: boolean; imageId: string | null; spreadId: string };
  split: { open: boolean; image: SpreadImage | null; spreadId: string };
  crop: { open: boolean; image: SpreadImage | null; spreadId: string };
  segment: { open: boolean; image: SpreadImage | null; spreadId: string };
  cropAudio: { open: boolean; item: SpreadAudio | null; spreadId: string };

  openGenerate: (img: SpreadImage) => void;
  closeGenerate: (open: boolean) => void;
  openSplit: (img: SpreadImage) => void;
  closeSplit: (open: boolean) => void;
  openCrop: (img: SpreadImage) => void;
  closeCrop: (open: boolean) => void;
  openSegment: (img: SpreadImage) => void;
  closeSegment: (open: boolean) => void;
  openCropAudio: (audio: SpreadAudio) => void;
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

  // Crop audio modal
  const [cropAudioOpen, setCropAudioOpen] = useState(false);
  const [cropAudioItem, setCropAudioItem] = useState<SpreadAudio | null>(null);
  const [cropAudioSpreadId, setCropAudioSpreadId] = useState<string>("");

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
    (audio: SpreadAudio) => {
      setCropAudioItem(audio);
      setCropAudioSpreadId(selectedSpreadId);
      setCropAudioOpen(true);
    },
    [selectedSpreadId]
  );

  const closeCropAudio = useCallback(() => {
    setCropAudioOpen(false);
    setCropAudioItem(null);
  }, []);

  const handleCropAudioComplete = useCallback(
    (newMediaUrl: string) => {
      if (!cropAudioItem) return;
      actions.updateRetouchAudio(cropAudioSpreadId, cropAudioItem.id, {
        media_url: newMediaUrl,
      });
      log.info("handleCropAudioComplete", "audio cropped", {
        audioId: cropAudioItem.id,
        spreadId: cropAudioSpreadId,
        newMediaUrl,
      });
      setCropAudioOpen(false);
      setCropAudioItem(null);
    },
    [cropAudioItem, cropAudioSpreadId, actions]
  );

  return {
    generate: { open: generateOpen, imageId: generateImageId, spreadId: generateSpreadId },
    split: { open: splitOpen, image: splitImage, spreadId: splitSpreadId },
    crop: { open: cropOpen, image: cropImage, spreadId: cropSpreadId },
    segment: { open: segmentOpen, image: segmentImage, spreadId: segmentSpreadId },
    cropAudio: { open: cropAudioOpen, item: cropAudioItem, spreadId: cropAudioSpreadId },
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
