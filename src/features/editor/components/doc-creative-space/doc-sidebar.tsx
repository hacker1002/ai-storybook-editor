import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocTabItem } from './doc-tab-item';
import type { ManuscriptDoc, DocType, AttachedFile } from '@/types/editor';

const FIXED_DOC_TYPES: DocType[] = ['brief', 'draft', 'script'];

interface DocSidebarProps {
  docs: ManuscriptDoc[];
  activeDocIndex: number;
  onDocSelect: (index: number) => void;
  onAddDoc: () => void;
  onUpdateDocTitle: (index: number, title: string) => void;
  onDeleteDoc: (index: number) => void;
  onGenerate: (index: number, prompt: string, attachments: AttachedFile[]) => Promise<void>;
  error?: string | null;
  onClearError?: () => void;
}

export function DocSidebar({
  docs,
  activeDocIndex,
  onDocSelect,
  onAddDoc,
  onUpdateDocTitle,
  onDeleteDoc,
  onGenerate,
  error,
  onClearError,
}: DocSidebarProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(activeDocIndex);
  const [promptInputs, setPromptInputs] = useState<Record<number, string>>({});
  const [attachments, setAttachments] = useState<Record<number, AttachedFile[]>>({});
  const [generatingIndexes, setGeneratingIndexes] = useState<Set<number>>(new Set());

  const handleToggle = (index: number) => {
    if (expandedIndex === index) {
      setExpandedIndex(null);
    } else {
      setExpandedIndex(index);
      onDocSelect(index);
    }
  };

  const handlePromptChange = (index: number, value: string) => {
    setPromptInputs((prev) => ({ ...prev, [index]: value }));
  };

  const handleAttachmentsChange = (index: number, files: AttachedFile[]) => {
    setAttachments((prev) => ({ ...prev, [index]: files }));
  };

  const handleGenerate = async (index: number) => {
    const prompt = promptInputs[index] || '';
    const files = attachments[index] || [];
    if (!prompt.trim()) return;

    setGeneratingIndexes((prev) => new Set(prev).add(index));
    try {
      await onGenerate(index, prompt, files);
      // Clear attachments after successful generation
      setAttachments((prev) => ({ ...prev, [index]: [] }));
    } finally {
      setGeneratingIndexes((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleAddDoc = () => {
    onAddDoc();
    setExpandedIndex(docs.length);
  };

  return (
    <aside
      role="navigation"
      aria-label="Document sidebar"
      className="flex h-full w-[280px] flex-col border-r bg-muted/30"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <h2 className="text-sm font-semibold">Docs</h2>
        <Button variant="ghost" size="icon" onClick={handleAddDoc} title="Add document">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-2 mt-2 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="flex-1">{error}</span>
          {onClearError && (
            <button onClick={onClearError} className="shrink-0 hover:opacity-70" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Accordion Doc List */}
      <div className="flex-1 overflow-auto p-2">
        {docs.map((doc, index) => {
          const isActive = index === activeDocIndex;
          const isExpanded = expandedIndex === index;
          const canEditTitle = !FIXED_DOC_TYPES.includes(doc.type);
          const canDelete = !FIXED_DOC_TYPES.includes(doc.type);

          return (
            <DocTabItem
              key={`${doc.type}-${index}`}
              doc={doc}
              index={index}
              isActive={isActive}
              isExpanded={isExpanded}
              canEditTitle={canEditTitle}
              canDelete={canDelete}
              promptInput={promptInputs[index] || ''}
              attachments={attachments[index] || []}
              isGenerating={generatingIndexes.has(index)}
              onToggle={() => handleToggle(index)}
              onUpdateTitle={(title) => onUpdateDocTitle(index, title)}
              onDelete={() => onDeleteDoc(index)}
              onPromptChange={(v) => handlePromptChange(index, v)}
              onAttachmentsChange={(files) => handleAttachmentsChange(index, files)}
              onGenerate={() => handleGenerate(index)}
            />
          );
        })}
      </div>
    </aside>
  );
}
