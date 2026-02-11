import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBookSettings, useBookReferences, useBookActions } from '@/stores/book-store';
import {
  TARGET_AUDIENCES,
  CORE_VALUES,
  FORMAT_GENRES,
  CONTENT_GENRES,
} from '@/constants/editor-constants';
import type { DocType } from '@/types/editor';

interface PromptPanelProps {
  docType: DocType;
  promptValue: string;
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
}

export function PromptPanel({
  docType,
  promptValue,
  isGenerating,
  onPromptChange,
  onGenerate,
}: PromptPanelProps) {
  const bookSettings = useBookSettings();
  const bookReferences = useBookReferences();
  const { updateSettings, updateReferences } = useBookActions();

  const showAttributes = docType === 'brief';

  return (
    <div className="space-y-3 p-3">
      {/* Attribute fields - Brief only */}
      {showAttributes && (
        <>
          <FormField label="TARGET AUDIENCE" required>
            <Select
              value={bookSettings.targetAudience}
              onValueChange={(v) => updateSettings({ targetAudience: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select target audience..." />
              </SelectTrigger>
              <SelectContent>
                {TARGET_AUDIENCES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="CORE VALUE" required>
            <Select
              value={bookSettings.targetCoreValue}
              onValueChange={(v) => updateSettings({ targetCoreValue: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select core value..." />
              </SelectTrigger>
              <SelectContent>
                {CORE_VALUES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="FORMAT GENRE" required>
            <Select
              value={bookSettings.formatGenre}
              onValueChange={(v) => updateSettings({ formatGenre: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select format genre..." />
              </SelectTrigger>
              <SelectContent>
                {FORMAT_GENRES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="CONTENT GENRE" required>
            <Select
              value={bookSettings.contentGenre}
              onValueChange={(v) => updateSettings({ contentGenre: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select content genre..." />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_GENRES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="ERA">
            <Select
              value={bookReferences.eraId ?? '__none__'}
              onValueChange={(v) => updateReferences({ eraId: v === '__none__' ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select era (optional)..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="LOCATION">
            <Select
              value={bookReferences.locationId ?? '__none__'}
              onValueChange={(v) => updateReferences({ locationId: v === '__none__' ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select location (optional)..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </>
      )}

      {/* Prompt textarea - all doc types */}
      <FormField label="PROMPT">
        <Textarea
          value={promptValue}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Enter your prompt for this manuscript..."
          className="min-h-[80px] resize-none"
        />
      </FormField>

      {/* Generate button */}
      <Button onClick={onGenerate} disabled={isGenerating || !promptValue.trim()} className="w-full">
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate
          </>
        )}
      </Button>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
