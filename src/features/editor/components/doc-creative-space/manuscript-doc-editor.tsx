import MDEditor from '@uiw/react-md-editor';
import type { ManuscriptDoc } from '@/types/editor';

interface ManuscriptDocEditorProps {
  doc: ManuscriptDoc | null;
  onContentChange: (content: string) => void;
}

export function ManuscriptDocEditor({ doc, onContentChange }: ManuscriptDocEditorProps) {
  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <span className="text-4xl">📄</span>
          <p className="mt-2">No document selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-color-mode="light">
      <MDEditor
        value={doc.content}
        onChange={(val) => onContentChange(val ?? '')}
        preview="edit"
        height="100%"
        textareaProps={{
          placeholder: 'Start writing your manuscript in Markdown...',
        }}
      />
    </div>
  );
}
