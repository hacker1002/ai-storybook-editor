import { useState } from 'react';
import { useDocs, useSnapshotActions } from '@/stores/snapshot-store';
import { DocSidebar } from './doc-sidebar';
import { ManuscriptDocEditor } from './manuscript-doc-editor';

export function DocCreativeSpace() {
  const docs = useDocs();
  const { updateDoc, addDoc, updateDocTitle, deleteDoc } = useSnapshotActions();
  const [activeDocIndex, setActiveDocIndex] = useState(0);

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
    if (!doc) return;

    // TODO: Call generate API based on doc type
    console.log('Generate:', doc.type, prompt);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
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
      />
      <main className="flex-1" aria-label="Document editor">
        <ManuscriptDocEditor doc={activeDoc} onContentChange={handleContentChange} />
      </main>
    </div>
  );
}
