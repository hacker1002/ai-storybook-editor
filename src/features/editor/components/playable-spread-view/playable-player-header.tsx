// playable-player-header.tsx - Minimal header for player mode with edition dropdown and settings
import { memo, useState } from "react";
import { Settings } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AVAILABLE_LANGUAGES } from "@/constants/editor-constants";
import { useNarrationLanguage, useQuizLanguage, usePlaybackStore } from "@/stores/animation-playback-store";
import type { PlayEdition } from "@/types/playable-types";
import { createLogger } from "@/utils/logger";

const log = createLogger('Editor', 'PlayablePlayerHeader');

interface PlayablePlayerHeaderProps {
  playEdition: PlayEdition;
  onEditionChange: (edition: PlayEdition) => void;
}

const EDITION_OPTIONS: { value: PlayEdition; label: string }[] = [
  { value: "classic", label: "Classic" },
  { value: "dynamic", label: "Dynamic" },
  { value: "interactive", label: "Interactive" },
];

export const PlayablePlayerHeader = memo(function PlayablePlayerHeader({
  playEdition,
  onEditionChange,
}: PlayablePlayerHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const narrationLanguage = useNarrationLanguage();
  const quizLanguage = useQuizLanguage();

  const handleNarrationLanguageChange = (code: string) => {
    log.info('handleNarrationLanguageChange', 'user changed narration language', { code });
    usePlaybackStore.getState().setNarrationLanguage(code);
  };

  const handleQuizLanguageChange = (code: string) => {
    log.info('handleQuizLanguageChange', 'user changed quiz language', { code });
    usePlaybackStore.getState().setQuizLanguage(code);
  };

  return (
    <div className="flex items-center justify-center px-3 py-3 border-b bg-background z-10 relative">
      <Select
        value={playEdition}
        onValueChange={(v) => onEditionChange(v as PlayEdition)}
      >
        <SelectTrigger
          className="w-[140px] h-7 text-xs"
          aria-label="Select play edition"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EDITION_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Settings gear icon - top right */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
            aria-label="Player settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Player Settings</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            {/* Narration Language */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Narration Language</label>
              <Select value={narrationLanguage} onValueChange={handleNarrationLanguageChange}>
                <SelectTrigger aria-label="Select narration language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quiz Language */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Quiz Language</label>
              <Select value={quizLanguage} onValueChange={handleQuizLanguageChange}>
                <SelectTrigger aria-label="Select quiz language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
