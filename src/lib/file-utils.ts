import type { AttachedFile } from '@/types/editor';
import { FILE_CONSTRAINTS, MAX_FILENAME_DISPLAY_LENGTH } from '@/types/editor';

/**
 * Validate and convert FileList to AttachedFile[]
 */
export function createAttachedFiles(files: FileList | File[]): AttachedFile[] {
  return Array.from(files)
    .filter((file) => file.size <= FILE_CONSTRAINTS.maxSizeBytes)
    .filter((file) =>
      (FILE_CONSTRAINTS.acceptedMimeTypes as readonly string[]).includes(file.type) ||
      file.type.startsWith('image/')
    )
    .map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      file,
    }));
}

/**
 * Merge new files with existing, respecting max limit
 */
export function mergeAttachments(
  existing: AttachedFile[],
  newFiles: AttachedFile[]
): AttachedFile[] {
  return [...existing, ...newFiles].slice(0, FILE_CONSTRAINTS.maxFiles);
}

/**
 * Convert File to base64 string (without data URL prefix)
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Truncate filename for display
 */
export function truncateFilename(name: string): string {
  if (name.length <= MAX_FILENAME_DISPLAY_LENGTH) return name;

  const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
  const maxBase = MAX_FILENAME_DISPLAY_LENGTH - ext.length - 3; // 3 for "..."

  if (maxBase <= 0) return name.slice(0, MAX_FILENAME_DISPLAY_LENGTH - 3) + '...';

  return name.slice(0, maxBase) + '...' + ext;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate files and return valid ones + rejection reasons
 * Used for showing toast notifications for rejected files
 */
export function validateFiles(files: FileList | File[]): {
  valid: AttachedFile[];
  rejected: Array<{ name: string; reason: string }>;
} {
  const valid: AttachedFile[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];

  Array.from(files).forEach((file) => {
    if (file.size > FILE_CONSTRAINTS.maxSizeBytes) {
      rejected.push({ name: file.name, reason: 'File exceeds 10MB limit' });
      return;
    }
    if (!(FILE_CONSTRAINTS.acceptedMimeTypes as readonly string[]).includes(file.type) &&
        !file.type.startsWith('image/')) {
      rejected.push({ name: file.name, reason: 'Unsupported file type' });
      return;
    }
    valid.push({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      file,
    });
  });

  return { valid, rejected };
}
