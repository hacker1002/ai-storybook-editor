import { useState } from 'react';
import { useDocs, useSnapshotActions } from '@/stores/snapshot-store';
import { useCurrentBook } from '@/stores/book-store';
import { generateDoc, buildLLMContext } from '@/lib/doc-api';
import { DocSidebar } from './doc-sidebar';
import { ManuscriptDocEditor } from './manuscript-doc-editor';
import type { DocType } from '@/types/editor';

export function DocCreativeSpace() {
  const docs = useDocs();
  const book = useCurrentBook();
  const { updateDoc, addDoc, updateDocTitle, deleteDoc, saveSnapshot } = useSnapshotActions();
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const activeDoc = docs[activeDocIndex] ?? null;

  const handleAddDoc = () => {
    addDoc({ type: 'other', title: 'Other', content: '' });
    setActiveDocIndex(docs.length);
  };

  const handleDeleteDoc = (index: number) => {
    deleteDoc(index);
    if (activeDocIndex >= docs.length - 1) {
      setActiveDocIndex(Math.max(0, docs.length - 2));
    }
  };

  const handleContentChange = (content: string) => {
    updateDoc(activeDocIndex, { content });
  };

  const handleGenerate = async (index: number, prompt: string) => {
    const doc = docs[index];
    if (!doc || doc.type === 'other') return;

    setGenerateError(null);

    if (!book) {
      setGenerateError('Book data not loaded');
      return;
    }

    const llmContext = buildLLMContext(book);
    if (!llmContext) {
      setGenerateError('Book settings incomplete (audience, core value, genre required)');
      return;
    }

    const docType = doc.type as Exclude<DocType, 'other'>;
    let result;

    if (docType === 'brief') {
      result = await generateDoc('brief', { prompt, llmContext });
    } else if (docType === 'draft') {
      const briefDoc = docs.find((d) => d.type === 'brief');
      if (!briefDoc?.content?.trim()) {
        setGenerateError('Brief content required to generate draft');
        return;
      }
      result = await generateDoc('draft', { brief: briefDoc.content, prompt, llmContext });
    } else {
      const draftDoc = docs.find((d) => d.type === 'draft');
      if (!draftDoc?.content?.trim()) {
        setGenerateError('Draft content required to generate script');
        return;
      }
      result = await generateDoc('script', { draft: draftDoc.content, prompt, llmContext });
    }

    if (!result.success || !result.data) {
      setGenerateError(result.error || 'Generation failed');
      return;
    }

    updateDoc(index, { content: result.data });
    setActiveDocIndex(index);
    await saveSnapshot();
  };

  return (
    <div className="flex h-full">
      <DocSidebar
        docs={docs}
        activeDocIndex={activeDocIndex}
        onDocSelect={setActiveDocIndex}
        onAddDoc={handleAddDoc}
        onUpdateDocTitle={updateDocTitle}
        onDeleteDoc={handleDeleteDoc}
        onGenerate={handleGenerate}
        error={generateError}
        onClearError={() => setGenerateError(null)}
      />
      <main className="flex-1" aria-label="Document editor">
        <ManuscriptDocEditor doc={activeDoc} onContentChange={handleContentChange} />
      </main>
    </div>
  );
}
