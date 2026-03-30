// variant-attribute-sections.tsx - Collapsible temporal/sensory/emotional attribute sections for a stage variant

import { useEffect, useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useSnapshotActions } from '@/stores/snapshot-store/selectors';
import { useEras, useEraActions } from '@/stores/era-store';
import type { StageTemporal, StageSensory, StageEmotional } from '@/types/stage-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'VariantAttributeSections');

type SectionName = 'temporal' | 'sensory' | 'emotional';

interface VariantAttributeSectionsProps {
  stageKey: string;
  variantKey: string;
  temporal: StageTemporal;
  sensory: StageSensory;
  emotional: StageEmotional;
}

const SEASON_OPTIONS = ['Spring', 'Summer', 'Autumn', 'Winter', 'Rainy', 'Dry'];
const WEATHER_OPTIONS = ['Clear', 'Cloudy', 'Rainy', 'Stormy', 'Snowy', 'Foggy', 'Windy'];
const TIME_OF_DAY_OPTIONS = ['Dawn', 'Morning', 'Noon', 'Afternoon', 'Dusk', 'Evening', 'Night', 'Midnight'];
const ATMOSPHERE_OPTIONS = ['Peaceful', 'Eerie', 'Mystical', 'Tense', 'Cheerful', 'Melancholic', 'Dramatic'];
const LIGHTING_OPTIONS = ['Natural', 'Dim', 'Bright', 'Candlelight', 'Moonlight', 'Neon', 'Dramatic'];
const COLOR_PALETTE_OPTIONS = ['Warm earth tones', 'Cool blues', 'Vibrant', 'Pastel', 'Monochrome', 'Muted', 'Neon'];
const MOOD_OPTIONS = ['Happy', 'Sad', 'Excited', 'Calm', 'Anxious', 'Romantic'];

export function VariantAttributeSections({
  stageKey,
  variantKey,
  temporal,
  sensory,
  emotional,
}: VariantAttributeSectionsProps) {
  const { updateStageVariant } = useSnapshotActions();
  const eras = useEras();
  const { fetchEras } = useEraActions();
  const [expandedSections, setExpandedSections] = useState<Set<SectionName>>(new Set());

  useEffect(() => { fetchEras(); }, [fetchEras]);

  const toggleSection = (section: SectionName) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      log.debug('toggleSection', 'toggle', { section, expanded: next.has(section) });
      return next;
    });
  };

  const handleTemporalSelectChange = (field: keyof StageTemporal, value: string) => {
    // Empty option sentinel value
    const finalValue = value === '__empty__' ? '' : value;
    log.debug('handleTemporalSelectChange', 'update', { stageKey, variantKey, field, value: finalValue });
    updateStageVariant(stageKey, variantKey, { temporal: { ...temporal, [field]: finalValue } });
  };

  // Update sensory field
  const handleSensoryBlur = (field: keyof StageSensory, value: string) => {
    if (value === sensory[field]) return;
    log.debug('handleSensoryBlur', 'update', { stageKey, variantKey, field, value });
    updateStageVariant(stageKey, variantKey, { sensory: { ...sensory, [field]: value } });
  };

  const handleSensorySelectChange = (field: keyof StageSensory, value: string) => {
    const finalValue = value === '__empty__' ? '' : value;
    log.debug('handleSensorySelectChange', 'update', { stageKey, variantKey, field, value: finalValue });
    updateStageVariant(stageKey, variantKey, { sensory: { ...sensory, [field]: finalValue } });
  };

  // Update emotional field
  const handleEmotionalSelectChange = (field: keyof StageEmotional, value: string) => {
    const finalValue = value === '__empty__' ? '' : value;
    log.debug('handleEmotionalSelectChange', 'update', { stageKey, variantKey, field, value: finalValue });
    updateStageVariant(stageKey, variantKey, { emotional: { ...emotional, [field]: finalValue } });
  };

  return (
    <div className="space-y-2">
      {/* Temporal Section */}
      <Collapsible open={expandedSections.has('temporal')} onOpenChange={() => toggleSection('temporal')}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium hover:bg-muted/50 rounded-md transition-colors">
          {expandedSections.has('temporal') ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="uppercase">Temporal</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 pt-2 pb-3 grid grid-cols-2 gap-x-4 gap-y-3">
            {/* Era */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block uppercase">Era</label>
              <Select
                value={temporal.era || '__empty__'}
                onValueChange={(value) => handleTemporalSelectChange('era', value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Select...</SelectItem>
                  {eras.map((era) => (
                    <SelectItem key={era.id} value={era.name}>{era.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Season */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block uppercase">Season</label>
              <Select
                value={temporal.season || '__empty__'}
                onValueChange={(value) => handleTemporalSelectChange('season', value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Select...</SelectItem>
                  {SEASON_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Weather */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block uppercase">Weather</label>
              <Select
                value={temporal.weather || '__empty__'}
                onValueChange={(value) => handleTemporalSelectChange('weather', value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Select...</SelectItem>
                  {WEATHER_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time of Day */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block uppercase">Time of Day</label>
              <Select
                value={temporal.time_of_day || '__empty__'}
                onValueChange={(value) => handleTemporalSelectChange('time_of_day', value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Select...</SelectItem>
                  {TIME_OF_DAY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Sensory Section */}
      <Collapsible open={expandedSections.has('sensory')} onOpenChange={() => toggleSection('sensory')}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium hover:bg-muted/50 rounded-md transition-colors">
          {expandedSections.has('sensory') ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="uppercase">Sensory</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 pt-2 pb-3 grid grid-cols-2 gap-x-4 gap-y-3">
            {/* Atmosphere */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block uppercase">Atmosphere</label>
              <Select
                value={sensory.atmosphere || '__empty__'}
                onValueChange={(value) => handleSensorySelectChange('atmosphere', value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Select...</SelectItem>
                  {ATMOSPHERE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Soundscape */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block uppercase">Soundscape</label>
              <Input
                defaultValue={sensory.soundscape}
                placeholder="Describe sounds..."
                className="h-8 text-sm"
                onBlur={(e) => handleSensoryBlur('soundscape', e.target.value.trim())}
              />
            </div>

            {/* Lighting */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block uppercase">Lighting</label>
              <Select
                value={sensory.lighting || '__empty__'}
                onValueChange={(value) => handleSensorySelectChange('lighting', value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Select...</SelectItem>
                  {LIGHTING_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Color Palette */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block uppercase">Color Palette</label>
              <Select
                value={sensory.color_palette || '__empty__'}
                onValueChange={(value) => handleSensorySelectChange('color_palette', value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Select...</SelectItem>
                  {COLOR_PALETTE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Emotional Section */}
      <Collapsible open={expandedSections.has('emotional')} onOpenChange={() => toggleSection('emotional')}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium hover:bg-muted/50 rounded-md transition-colors">
          {expandedSections.has('emotional') ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="uppercase">Emotional</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 pt-2 pb-3 space-y-3">
            {/* Mood */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block uppercase">Mood</label>
              <Select
                value={emotional.mood || '__empty__'}
                onValueChange={(value) => handleEmotionalSelectChange('mood', value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Select...</SelectItem>
                  {MOOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
