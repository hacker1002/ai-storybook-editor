import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocTabItem } from './doc-tab-item';
import type { ManuscriptDoc, DocType } from '@/types/editor';

const FIXED_DOC_TYPES: DocType[] = ['brief', 'draft', 'script'];

interface DocSidebarProps {
  docs: ManuscriptDoc[];
  activeDocIndex: number;
  onDocSelect: (index: number) => void;
  onAddDoc: () => void;
  onUpdateDocTitle: (index: number, title: string) => void;
  onDeleteDoc: (index: number) => void;
  onGenerate: (index: number, prompt: string) => Promise<void>;
}

export function DocSidebar({
  docs,
  activeDocIndex,
  onDocSelect,
  onAddDoc,
  onUpdateDocTitle,
  onDeleteDoc,
  onGenerate,
}: DocSidebarProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(activeDocIndex);
  const [promptInputs, setPromptInputs] = useState<Record<number, string>>({});
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

  const handleGenerate = async (index: number) => {
    const prompt = promptInputs[index] || '';
    if (!prompt.trim()) return;

    setGeneratingIndexes((prev) => new Set(prev).add(index));
    try {
      await onGenerate(index, prompt);
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
              isGenerating={generatingIndexes.has(index)}
              onToggle={() => handleToggle(index)}
              onUpdateTitle={(title) => onUpdateDocTitle(index, title)}
              onDelete={() => onDeleteDoc(index)}
              onPromptChange={(v) => handlePromptChange(index, v)}
              onGenerate={() => handleGenerate(index)}
            />
          );
        })}
      </div>
    </aside>
  );
}
