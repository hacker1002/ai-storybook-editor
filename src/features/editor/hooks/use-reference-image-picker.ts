// use-reference-image-picker.ts - Hook encapsulating reference image selection, validation, and base64 conversion

import { useRef, useState, useCallback } from "react";
import { fileToBase64 } from "@/utils/file-utils";
import { createLogger } from "@/utils/logger";
import { toast } from "sonner";

const log = createLogger("Editor", "ReferenceImagePicker");

const DEFAULT_MAX_IMAGES = 5;
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export interface ReferenceImage {
  label: string;
  base64Data: string;
  mimeType: string;
}

export function useReferenceImagePicker(maxImages = DEFAULT_MAX_IMAGES) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ReferenceImage[]>([]);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFilesSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const fileArray = Array.from(files);
      e.target.value = "";

      const remaining = maxImages - images.length;
      if (remaining <= 0) {
        toast.warning(`Maximum ${maxImages} reference images allowed`);
        return;
      }

      const validFiles: File[] = [];
      for (const file of fileArray) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          log.warn("handleFilesSelected", "invalid mime type", { name: file.name, type: file.type });
          toast.warning(`${file.name}: only PNG, JPEG, WebP accepted`);
          continue;
        }
        if (file.size > DEFAULT_MAX_FILE_SIZE) {
          log.warn("handleFilesSelected", "file too large", { name: file.name, size: file.size });
          toast.warning(`${file.name}: exceeds 10MB limit`);
          continue;
        }
        validFiles.push(file);
      }

      const toProcess = validFiles.slice(0, remaining);
      if (validFiles.length > remaining) {
        toast.warning(
          `Only ${remaining} more reference image(s) can be added (max ${maxImages})`
        );
      }

      log.debug("handleFilesSelected", "converting files", { count: toProcess.length });
      try {
        const newImages = await Promise.all(
          toProcess.map(async (file) => ({
            label: file.name,
            base64Data: await fileToBase64(file),
            mimeType: file.type,
          }))
        );
        setImages((prev) => [...prev, ...newImages]);
      } catch (err) {
        log.error("handleFilesSelected", "conversion failed", { error: err });
        toast.error("Failed to process reference image(s)");
      }
    },
    [images.length, maxImages]
  );

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearImages = useCallback(() => {
    setImages([]);
  }, []);

  return {
    images,
    inputRef,
    openPicker,
    handleFilesSelected,
    removeImage,
    clearImages,
  };
}
