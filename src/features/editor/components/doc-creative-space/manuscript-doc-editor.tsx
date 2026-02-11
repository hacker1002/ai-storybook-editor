import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';
import { Bold, Italic, Strikethrough, Quote, List, ListOrdered, Minus, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { ManuscriptDoc } from '@/types/editor';
import { cn } from '@/lib/utils';

interface ManuscriptDocEditorProps {
  doc: ManuscriptDoc | null;
  onContentChange: (content: string) => void;
}

export function ManuscriptDocEditor({ doc, onContentChange }: ManuscriptDocEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing your manuscript...',
      }),
    ],
    content: doc?.content ?? '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] px-6 py-4',
      },
    },
    onUpdate: ({ editor }) => {
      onContentChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && doc?.content !== editor.getHTML()) {
      editor.commands.setContent(doc?.content ?? '');
    }
  }, [doc?.content, editor]);

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
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b bg-muted/30 px-2 py-1.5">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          isActive={editor?.isActive('bold')}
          icon={Bold}
          title="Bold (Ctrl+B)"
        />
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          isActive={editor?.isActive('italic')}
          icon={Italic}
          title="Italic (Ctrl+I)"
        />
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          isActive={editor?.isActive('strike')}
          icon={Strikethrough}
          title="Strikethrough"
        />
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor?.isActive('heading', { level: 2 })}
          icon={Type}
          title="Heading"
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          isActive={editor?.isActive('blockquote')}
          icon={Quote}
          title="Quote"
        />
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          isActive={editor?.isActive('bulletList')}
          icon={List}
          title="Bullet List"
        />
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          isActive={editor?.isActive('orderedList')}
          icon={ListOrdered}
          title="Numbered List"
        />
        <ToolbarButton
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          icon={Minus}
          title="Horizontal Rule"
        />
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  isActive,
  icon: Icon,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      title={title}
      className={cn('h-8 w-8 p-0', isActive && 'bg-accent')}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
