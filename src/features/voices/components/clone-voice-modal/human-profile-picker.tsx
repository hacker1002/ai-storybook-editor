import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Human } from '@/types/human';
import { createLogger } from '@/utils/logger';

const log = createLogger('Voices', 'HumanProfilePicker');

export interface HumanProfilePickerProps {
  humans: Human[];
  isLoading: boolean;
  humanId: string | null;
  voiceProfileIndex: number | null;
  onHumanSelect: (humanId: string) => void;
  onVoiceProfileSelect: (index: number) => void;
  disabled: boolean;
}

interface FieldBlockProps {
  id: string;
  label: string;
  children: ReactNode;
}

function FieldBlock({ id, label, children }: FieldBlockProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium uppercase tracking-wide">
        {label}
      </Label>
      {children}
    </div>
  );
}

function humanDisplayName(h: Human): string {
  return h.displayName?.en_US || h.displayName?.vi_VN || h.sourceName;
}

interface EmptyHintProps {
  message: string;
  linkTo: string;
  linkLabel: string;
}

function EmptyHint({ message, linkTo, linkLabel }: EmptyHintProps) {
  return (
    <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-2">
      <div className="text-muted-foreground">{message}</div>
      <Link to={linkTo} className="text-primary underline">
        {linkLabel}
      </Link>
    </div>
  );
}

export function HumanProfilePicker({
  humans,
  isLoading,
  humanId,
  voiceProfileIndex,
  onHumanSelect,
  onVoiceProfileSelect,
  disabled,
}: HumanProfilePickerProps) {
  const selectedHuman = humans.find((h) => h.id === humanId);
  const hasNoHumans = !isLoading && humans.length === 0;
  const hasNoVoiceProfiles =
    Boolean(selectedHuman) && (selectedHuman?.voiceProfiles.length ?? 0) === 0;

  const humanPlaceholder = isLoading
    ? 'Loading humans...'
    : hasNoHumans
      ? 'No humans available'
      : 'Select human';

  const voiceProfilePlaceholder = !selectedHuman
    ? 'Select human first'
    : hasNoVoiceProfiles
      ? 'No recordings available'
      : 'Select voice profile';

  const handleHumanChange = (next: string) => {
    log.debug('handleHumanChange', 'changed', { humanId: next });
    onHumanSelect(next);
  };

  const handleVoiceProfileChange = (next: string) => {
    const idx = Number.parseInt(next, 10);
    if (Number.isNaN(idx)) return;
    log.debug('handleVoiceProfileChange', 'changed', { index: idx });
    onVoiceProfileSelect(idx);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FieldBlock id="clone-human" label="Human">
          <Select
            value={humanId ?? ''}
            onValueChange={handleHumanChange}
            disabled={disabled || hasNoHumans || isLoading}
          >
            <SelectTrigger id="clone-human" aria-required="true">
              <SelectValue placeholder={humanPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {humans.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {humanDisplayName(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBlock>

        <FieldBlock id="clone-voice-profile" label="Voice Profile">
          <Select
            value={voiceProfileIndex !== null ? String(voiceProfileIndex) : ''}
            onValueChange={handleVoiceProfileChange}
            disabled={disabled || !selectedHuman || hasNoVoiceProfiles}
          >
            <SelectTrigger
              id="clone-voice-profile"
              aria-required="true"
              aria-disabled={!selectedHuman || hasNoVoiceProfiles}
            >
              <SelectValue placeholder={voiceProfilePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {selectedHuman?.voiceProfiles.map((vp, idx) => (
                <SelectItem key={`${vp.clientId}-${idx}`} value={String(idx)}>
                  {`${vp.name || `Voice ${idx + 1}`} · age ${vp.age}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBlock>
      </div>

      {hasNoHumans ? (
        <EmptyHint
          message="No humans yet. Cloning requires a recorded voice from a Human in your library."
          linkTo="/humans"
          linkLabel="+ Open Humans library →"
        />
      ) : hasNoVoiceProfiles && selectedHuman ? (
        <EmptyHint
          message="This human has no voice recordings. Add one in the Human detail page."
          linkTo={`/humans/${selectedHuman.id}`}
          linkLabel={`→ Open ${humanDisplayName(selectedHuman)}`}
        />
      ) : null}
    </div>
  );
}
