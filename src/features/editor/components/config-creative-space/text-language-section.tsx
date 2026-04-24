// text-language-section.tsx - Per-language typography editor for Text settings.
// Renders textbox typography controls (font/size/color/decoration/align/spacing) for one language.

import * as React from 'react';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { NumberStepper } from '@/components/ui/number-stepper';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { FONT_FAMILY_OPTIONS, DEFAULT_TYPOGRAPHY } from '@/constants/config-constants';
import type { TypographySettings } from '@/types/editor';
import { cn } from '@/utils/utils';

const FONT_OPTIONS = FONT_FAMILY_OPTIONS.map((f) => ({ value: f, label: f }));

interface TextLanguageSectionProps {
  langCode: string;
  langLabel: string;
  typography: TypographySettings;
  onChange: (langCode: string, updates: Partial<TypographySettings>) => void;
}

export function TextLanguageSection({
  langCode,
  langLabel,
  typography,
  onChange,
}: TextLanguageSectionProps) {
  const typo = { ...DEFAULT_TYPOGRAPHY, ...typography };

  // Decoration is a space-separated CSS value: "none" | "underline" | "line-through" | "underline line-through"
  const decorationParts = typo.decoration === 'none' ? [] : typo.decoration.split(' ').filter(Boolean);
  const isUnderline = decorationParts.includes('underline');
  const isStrikethrough = decorationParts.includes('line-through');

  const updateDecoration = (part: string, active: boolean) => {
    const parts = new Set(decorationParts);
    if (active) parts.add(part);
    else parts.delete(part);
    const next = parts.size > 0 ? Array.from(parts).join(' ') : 'none';
    onChange(langCode, { decoration: next });
  };

  const handleWeightToggle = (val: string | string[]) => {
    const isBold = val === 'bold';
    onChange(langCode, { weight: isBold ? 700 : 400 });
  };

  const handleStyleToggle = (val: string | string[]) => {
    const isItalic = val === 'italic';
    onChange(langCode, { style: isItalic ? 'italic' : 'normal' });
  };

  const handleAlignToggle = (val: string | string[]) => {
    if (typeof val === 'string' && val) {
      onChange(langCode, { text_align: val });
    }
  };

  const handleLineHeight = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v > 0) onChange(langCode, { line_height: v });
  };

  const handleLetterSpacing = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) onChange(langCode, { letter_spacing: v });
  };

  return (
    <div className="flex flex-col gap-4 border-b pb-5 last:border-b-0">
      {/* Language header */}
      <p className="text-xs font-bold uppercase tracking-wider">{langLabel}</p>

      {/* TEXTBOX TYPOGRAPHY */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Textbox
        </p>

        {/* Row 1: Font family + size + color */}
        <div className="mb-3 flex items-center gap-2">
          <div className="w-44 shrink-0">
            <SearchableDropdown
              options={FONT_OPTIONS}
              value={typo.family}
              onChange={(val) => onChange(langCode, { family: val })}
              placeholder="Font..."
            />
          </div>
          <NumberStepper
            value={typo.size}
            min={8}
            max={72}
            step={1}
            onChange={(val) => onChange(langCode, { size: val })}
            className="shrink-0"
          />
          <input
            type="color"
            value={typo.color}
            onChange={(e) => onChange(langCode, { color: e.target.value })}
            className="h-8 w-9 shrink-0 cursor-pointer rounded border p-0.5"
            title="Text color"
          />
        </div>

        {/* Row 2: B / I / U / S decoration toggles */}
        <div className="mb-3 flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={typo.weight === 700 ? 'bold' : ''}
            onValueChange={handleWeightToggle}
          >
            <ToggleGroupItem value="bold" className="h-8 w-8 p-0 text-sm font-bold">B</ToggleGroupItem>
          </ToggleGroup>

          <ToggleGroup
            type="single"
            value={typo.style === 'italic' ? 'italic' : ''}
            onValueChange={handleStyleToggle}
          >
            <ToggleGroupItem value="italic" className="h-8 w-8 p-0 text-sm italic">I</ToggleGroupItem>
          </ToggleGroup>

          <button
            type="button"
            onClick={() => updateDecoration('underline', !isUnderline)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded border text-sm underline',
              isUnderline ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'
            )}
          >
            U
          </button>

          <button
            type="button"
            onClick={() => updateDecoration('line-through', !isStrikethrough)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded border text-sm line-through',
              isStrikethrough ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'
            )}
          >
            S
          </button>
        </div>

        {/* Row 3: Text align */}
        <div className="mb-3">
          <ToggleGroup
            type="single"
            value={typo.text_align}
            onValueChange={handleAlignToggle}
          >
            <ToggleGroupItem value="left"   className="h-8 w-8 p-0"><AlignLeft   className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="center" className="h-8 w-8 p-0"><AlignCenter className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="right"  className="h-8 w-8 p-0"><AlignRight  className="h-4 w-4" /></ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Row 4: Line height + letter spacing */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">Line Height</span>
            <input
              type="number"
              value={typo.line_height}
              min={0.5}
              max={5}
              step={0.1}
              onChange={handleLineHeight}
              className="h-8 w-14 rounded border bg-background px-2 text-center text-sm focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">Spacing</span>
            <input
              type="number"
              value={typo.letter_spacing}
              min={-10}
              max={50}
              step={0.5}
              onChange={handleLetterSpacing}
              className="h-8 w-14 rounded border bg-background px-2 text-center text-sm focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-sm text-muted-foreground">px</span>
          </div>
        </div>
      </div>
    </div>
  );
}
