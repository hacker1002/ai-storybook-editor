// prompt-toolbar.tsx - AI Remix prompt input toolbar
import { Paperclip, Send, X, Loader2 } from 'lucide-react';
import { useRef, useEffect, type ChangeEvent, type KeyboardEvent } from 'react';
import type { PromptToolbarProps } from './types';
import { REMIX_EDITOR } from './constants';

const MAX_FILE_SIZE = REMIX_EDITOR.REFERENCE_MAX_SIZE_MB * 1024 * 1024;

/**
 * PromptToolbar - AI Remix prompt input interface
 *
 * Provides prompt input, reference image upload, and submission controls.
 * Parent component handles portal rendering and positioning.
 */
export function PromptToolbar({
  position,
  prompt,
  referenceImage,
  isSubmitting,
  error,
  onPromptChange,
  onReferenceUpload,
  onSubmit,
  onClose: _onClose, // eslint-disable-line @typescript-eslint/no-unused-vars
}: PromptToolbarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus textarea when toolbar appears
  useEffect(() => {
    if (position && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [position]);

  if (!position) return null;

  // Handle file selection with validation
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      // Clear the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      // Let parent handle error display via error prop
      onReferenceUpload(null);
      return;
    }

    onReferenceUpload(file);
  };

  // Handle file removal
  const handleRemoveFile = () => {
    onReferenceUpload(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle textarea keydown (Enter to submit, Shift+Enter for newline)
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim() && !isSubmitting) {
        onSubmit();
      }
    }
  };

  const isSubmitDisabled = !prompt.trim() || isSubmitting;

  return (
    <div
      data-toolbar="prompt"
      role="dialog"
      aria-label="AI Remix prompt input"
      className="min-w-[320px] max-w-[480px] bg-white border border-gray-200 rounded-lg shadow-lg p-3"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-gray-700">Prompt</span>

        <div className="flex items-center gap-1">
          {/* Upload Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
            aria-label="Upload reference image"
            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* File Badge (conditional) */}
      {referenceImage && (
        <div className="flex items-center justify-between gap-2 mb-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded">
          <span className="text-xs text-blue-700 truncate flex-1">
            {referenceImage.name}
          </span>
          <button
            type="button"
            onClick={handleRemoveFile}
            disabled={isSubmitting}
            aria-label="Remove reference image"
            className="p-0.5 text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Inline Error Display */}
      {error && (
        <div className="mb-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded">
          <span className="text-xs text-red-700">{error}</span>
        </div>
      )}

      {/* Input Row */}
      <div className="flex items-end gap-2">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={REMIX_EDITOR.PROMPT_MAX_LENGTH}
          placeholder="Describe your remix... (Enter to submit, Shift+Enter for newline)"
          disabled={isSubmitting}
          aria-label="Prompt input"
          className="flex-1 resize-none px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
          rows={3}
        />

        {/* Send Button */}
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitDisabled}
          aria-label="Submit prompt"
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center min-w-[44px]"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Character Count */}
      <div className="mt-1 text-xs text-gray-500 text-right">
        {prompt.length}/{REMIX_EDITOR.PROMPT_MAX_LENGTH}
      </div>
    </div>
  );
}
