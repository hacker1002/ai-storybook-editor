import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DummyItem } from './dummy-item';
import { useDummies, useDocs, useDummyActions, useCurrentLanguage } from './hooks';
import { useCurrentBook } from '@/stores/book-store';
import { buildLLMContext } from '@/lib/doc-api';
import { callGenerateDummy, applyDummyResult } from '@/lib/dummy-api';
import type { AttachedFile } from '@/types/editor';
import { DEFAULT_DUMMY_TITLE } from '@/types/dummy';
import { toast } from 'sonner';

interface DummySidebarProps {
  selectedDummyId: string | null;
  onDummySelect: (dummyId: string) => void;
}

export function DummySidebar({ selectedDummyId, onDummySelect }: DummySidebarProps) {
  const dummies = useDummies();
  const docs = useDocs();
  const actions = useDummyActions();
  const currentBook = useCurrentBook();
  const languageKey = useCurrentLanguage();

  // Local state
  const [expandedDummyId, setExpandedDummyId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [selectedScripts, setSelectedScripts] = useState<Record<string, string>>({});
  const [promptInputs, setPromptInputs] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Record<string, AttachedFile[]>>({});
  const [isGenerating, setIsGenerating] = useState<Record<string, boolean>>({});

  const handleToggle = (dummyId: string) => {
    if (expandedDummyId === dummyId) {
      setExpandedDummyId(null);
    } else {
      setExpandedDummyId(dummyId);
    }
  };

  const handleSelect = (dummyId: string) => {
    onDummySelect(dummyId);
  };

  const handleAddDummy = () => {
    const newDummy = {
      id: crypto.randomUUID(),
      title: DEFAULT_DUMMY_TITLE,
      type: 'prose' as const,
      spreads: [],
    };
    actions.addDummy(newDummy);
    setExpandedDummyId(newDummy.id);
    onDummySelect(newDummy.id);
  };

  const handleTitleChange = (dummyId: string, title: string) => {
    actions.updateDummy(dummyId, { title });
  };

  const handleEditTitleToggle = (dummyId: string) => {
    setEditingTitleId((prev) => (prev === dummyId ? null : dummyId));
  };

  const handleScriptChange = (dummyId: string, scriptId: string) => {
    setSelectedScripts((prev) => ({ ...prev, [dummyId]: scriptId }));
  };

  const handlePromptChange = (dummyId: string, value: string) => {
    setPromptInputs((prev) => ({ ...prev, [dummyId]: value }));
  };

  const handleAttachmentsChange = (dummyId: string, files: AttachedFile[]) => {
    setAttachments((prev) => ({ ...prev, [dummyId]: files }));
  };

  const handleGenerate = async (dummyId: string) => {
    const prompt = promptInputs[dummyId] || '';
    const files = attachments[dummyId] || [];
    const scriptIdStr = selectedScripts[dummyId];

    // Validation: script selection required
    if (!scriptIdStr) {
      toast.error('Please select a script first');
      return;
    }

    // Get script content
    const scriptDocs = docs.filter((d) => d.type === 'script');
    const scriptIdx = parseInt(scriptIdStr, 10);
    const scriptDoc = scriptDocs[scriptIdx];

    if (!scriptDoc?.content) {
      toast.error('Selected script has no content');
      return;
    }

    // Validation: book context required
    if (!currentBook) {
      toast.error('No book loaded');
      return;
    }

    const llmContext = buildLLMContext(currentBook);
    if (!llmContext) {
      toast.error('Book settings incomplete (audience, genre, etc.)');
      return;
    }

    // Find existing dummy
    const existingDummy = dummies.find((d) => d.id === dummyId);
    if (!existingDummy) {
      toast.error('Dummy not found');
      return;
    }

    setIsGenerating((prev) => ({ ...prev, [dummyId]: true }));

    try {
      const result = await callGenerateDummy({
        script: scriptDoc.content,
        prompt,
        languageKey,
        attachments: files,
        llmContext,
      });

      if (!result.success || !result.data) {
        toast.error(result.error || 'Generation failed');
        return;
      }

      // Apply result to dummy
      const updatedDummy = applyDummyResult(existingDummy, result.data);
      actions.updateDummy(dummyId, {
        title: updatedDummy.title,
        type: updatedDummy.type,
        spreads: updatedDummy.spreads,
      });

      // Persist to Supabase
      await actions.saveSnapshot();

      toast.success('Dummy generated successfully');
    } catch (error) {
      console.error('[DummySidebar] Generate error:', error);
      toast.error('Unexpected error during generation');
    } finally {
      setIsGenerating((prev) => ({ ...prev, [dummyId]: false }));
    }
  };

  const handleDuplicate = (dummyId: string) => {
    const duplicated = actions.duplicateDummy(dummyId);
    if (duplicated) {
      setExpandedDummyId(duplicated.id);
      onDummySelect(duplicated.id);
    }
  };

  const handleDelete = (dummyId: string) => {
    actions.deleteDummy(dummyId);
    if (selectedDummyId === dummyId) {
      // Find another dummy to select (excluding the one being deleted)
      const remainingDummies = dummies.filter((d) => d.id !== dummyId);
      if (remainingDummies.length > 0) {
        onDummySelect(remainingDummies[0].id);
      }
      // If no dummies remain, parent component handles empty state
    }
    if (expandedDummyId === dummyId) {
      setExpandedDummyId(null);
    }
  };

  return (
    <aside
      role="navigation"
      aria-label="Dummy sidebar"
      className="flex h-full w-[280px] flex-col border-r bg-muted/30"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <h2 className="text-sm font-semibold">Dummies</h2>
        <Button variant="ghost" size="icon" onClick={handleAddDummy} title="Add dummy">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Dummy list */}
      <div className="flex-1 overflow-auto p-2">
        {dummies.map((dummy) => (
          <DummyItem
            key={dummy.id}
            dummy={dummy}
            isSelected={selectedDummyId === dummy.id}
            isExpanded={expandedDummyId === dummy.id}
            docs={docs}
            selectedScriptId={selectedScripts[dummy.id]}
            promptValue={promptInputs[dummy.id] || ''}
            attachments={attachments[dummy.id] || []}
            isGenerating={isGenerating[dummy.id] || false}
            editingTitle={editingTitleId === dummy.id}
            onSelect={() => handleSelect(dummy.id)}
            onToggle={() => handleToggle(dummy.id)}
            onTitleChange={(title) => handleTitleChange(dummy.id, title)}
            onEditTitleToggle={() => handleEditTitleToggle(dummy.id)}
            onScriptChange={(scriptId) => handleScriptChange(dummy.id, scriptId)}
            onPromptChange={(value) => handlePromptChange(dummy.id, value)}
            onAttachmentsChange={(files) => handleAttachmentsChange(dummy.id, files)}
            onGenerate={() => handleGenerate(dummy.id)}
            onDuplicate={() => handleDuplicate(dummy.id)}
            onDelete={() => handleDelete(dummy.id)}
          />
        ))}
      </div>
    </aside>
  );
}
