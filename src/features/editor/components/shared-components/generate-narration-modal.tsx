"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Pause, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils/utils";
import { createLogger } from "@/utils/logger";
import type { TextboxAudio, TextboxAudioMedia } from "@/types/spread-types";

const log = createLogger("Editor", "GenerateNarrationModal");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VOICE_OPTIONS = [
  { value: "vi-female-1", label: "Vietnamese - Female 1" },
  { value: "vi-female-2", label: "Vietnamese - Female 2" },
  { value: "vi-male-1", label: "Vietnamese - Male 1" },
  { value: "vi-male-2", label: "Vietnamese - Male 2" },
  { value: "en-female-1", label: "English - Female 1" },
  { value: "en-female-2", label: "English - Female 2" },
  { value: "en-male-1", label: "English - Male 1" },
  { value: "en-male-2", label: "English - Male 2" },
];

const EMOTION_OPTIONS = [
  { value: "neutral", label: "Neutral" },
  { value: "happy", label: "Happy" },
  { value: "sad", label: "Sad" },
  { value: "excited", label: "Excited" },
  { value: "calm", label: "Calm" },
  { value: "serious", label: "Serious" },
  { value: "angry", label: "Angry" },
  { value: "whisper", label: "Whisper" },
];

const SPEED_OPTIONS = [
  { value: 0.75, label: "0.75x" },
  { value: 1, label: "1x" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
];

function formatDuration(seconds?: number): string {
  if (seconds == null || seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getVoiceLabel(voiceId: string): string {
  if (!voiceId) return "Unknown";
  return VOICE_OPTIONS.find((v) => v.value === voiceId)?.label ?? voiceId;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GenerateNarrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  script: string;
  existingAudio?: TextboxAudio;
  onGenerated: (audio: TextboxAudio) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenerateNarrationModal({
  isOpen,
  onClose,
  script,
  existingAudio,
  onGenerated,
}: GenerateNarrationModalProps) {
  // -- Local state ----------------------------------------------------------
  const [selectedVoice, setSelectedVoice] = useState("");
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState(
    existingAudio?.emotion ?? "neutral",
  );
  const [selectedSpeed, setSelectedSpeed] = useState(
    existingAudio?.speed ?? 1,
  );
  const [editableScript, setEditableScript] = useState(script);
  const [mediaList, setMediaList] = useState<TextboxAudioMedia[]>(
    existingAudio?.media ?? [],
  );
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  // Keyed by url (unique per media entry, unlike voice_id which can be empty)
  const [durations, setDurations] = useState<Record<string, number>>({});

  const audioRef = useRef<HTMLAudioElement>(null);

  // -- Load durations from audio URLs ---------------------------------------
  useEffect(() => {
    mediaList.forEach((media) => {
      if (durations[media.url] != null) return;
      const audio = new Audio();
      audio.preload = "metadata";
      audio.src = media.url;
      audio.addEventListener("loadedmetadata", () => {
        if (Number.isFinite(audio.duration)) {
          setDurations((prev) => ({ ...prev, [media.url]: audio.duration }));
        }
      });
    });
  }, [mediaList, durations]);

  // -- Reset when modal opens -----------------------------------------------
  const existingAudioRef = useRef(existingAudio);
  const scriptRef = useRef(script);
  existingAudioRef.current = existingAudio;
  scriptRef.current = script;

  useEffect(() => {
    if (!isOpen) return;

    const audio = existingAudioRef.current;
    setEditableScript(scriptRef.current);
    setMediaList(audio?.media ?? []);
    const initialMedia = audio?.media ?? [];
    setSelectedVoice(initialMedia[0]?.voice_id ?? "");
    setSelectedMediaIndex(initialMedia.length > 0 ? 0 : null);
    setSelectedEmotion(audio?.emotion ?? "neutral");
    setSelectedSpeed(audio?.speed ?? 1);
    setPlayingIndex(null);
    setIsPlaying(false);
    setDurations({});

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // -- Voice dropdown change handler ----------------------------------------
  // When user picks a voice and the selected media has empty voice_id,
  // assign the voice_id to that media entry.
  const handleVoiceChange = useCallback(
    (newVoice: string) => {
      setSelectedVoice(newVoice);

      // If selected media has empty voice_id, assign the chosen voice to it
      if (selectedMediaIndex != null) {
        const selectedMedia = mediaList[selectedMediaIndex];
        if (selectedMedia && !selectedMedia.voice_id) {
          const updatedList = mediaList.map((m, i) =>
            i === selectedMediaIndex ? { ...m, voice_id: newVoice } : m,
          );
          setMediaList(updatedList);
          onGenerated({
            script: editableScript,
            speed: selectedSpeed,
            emotion: selectedEmotion,
            media: updatedList,
          });
          log.info("handleVoiceChange", "voice assigned to uploaded media", {
            index: selectedMediaIndex,
            voiceId: newVoice,
          });
          return;
        }
      }

      // Sync media list selection: highlight matching item or deselect
      const matchIdx = mediaList.findIndex((m) => m.voice_id === newVoice);
      setSelectedMediaIndex(matchIdx >= 0 ? matchIdx : null);
    },
    [selectedMediaIndex, mediaList, editableScript, selectedSpeed, selectedEmotion, onGenerated],
  );

  // -- Select a media row ---------------------------------------------------
  const handleSelectRow = useCallback(
    (index: number) => {
      setSelectedMediaIndex(index);
      const media = mediaList[index];
      setSelectedVoice(media?.voice_id ?? "");
    },
    [mediaList],
  );

  // -- Generate handler (mock API) -----------------------------------------
  const handleGenerate = useCallback(async () => {
    if (!editableScript.trim() || !selectedVoice) return;
    setIsGenerating(true);
    log.info("handleGenerate", "generate started", {
      voice: selectedVoice,
      emotion: selectedEmotion,
      speed: selectedSpeed,
    });

    try {
      // TODO: Replace with real edge function: POST narration-generate-narration
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const mockUrl = `https://storage.example.com/narration/${selectedVoice}-${Date.now()}.mp3`;

      const newEntry: TextboxAudioMedia = {
        voice_id: selectedVoice,
        url: mockUrl,
      };
      const existingIdx = mediaList.findIndex(
        (m) => m.voice_id === selectedVoice,
      );
      const updatedList =
        existingIdx >= 0
          ? mediaList.map((m, i) => (i === existingIdx ? newEntry : m))
          : [...mediaList, newEntry];
      setMediaList(updatedList);

      // Auto-select and play the newly generated row
      const newIndex = existingIdx >= 0 ? existingIdx : updatedList.length - 1;
      setSelectedMediaIndex(newIndex);
      setPlayingIndex(newIndex);
      setIsPlaying(true);
      if (audioRef.current) {
        audioRef.current.src = mockUrl;
        audioRef.current.play().catch(() => {
          setIsPlaying(false);
        });
      }

      onGenerated({
        script: editableScript,
        speed: selectedSpeed,
        emotion: selectedEmotion,
        media: updatedList,
      });

      toast.success("Narration generated");
      log.info("handleGenerate", "generate success", {
        voice: selectedVoice,
      });
    } catch (err) {
      toast.error("Failed to generate narration");
      log.error("handleGenerate", "generate failed", {
        error: String(err),
      });
    } finally {
      setIsGenerating(false);
    }
  }, [
    editableScript,
    selectedVoice,
    selectedEmotion,
    selectedSpeed,
    mediaList,
    onGenerated,
  ]);

  // -- Play/pause a media row ----------------------------------------------
  const handlePlayRow = useCallback(
    (index: number) => {
      const entry = mediaList[index];
      if (!entry) return;

      if (playingIndex === index && isPlaying) {
        audioRef.current?.pause();
        setPlayingIndex(null);
        setIsPlaying(false);
      } else {
        setPlayingIndex(index);
        if (audioRef.current) {
          audioRef.current.src = entry.url;
          audioRef.current.play().catch(() => {
            setIsPlaying(false);
          });
          setIsPlaying(true);
        }
      }

      handleSelectRow(index);
    },
    [mediaList, playingIndex, isPlaying, handleSelectRow],
  );

  // -- Delete a media row ---------------------------------------------------
  const handleDeleteRow = useCallback(
    (index: number) => {
      if (playingIndex === index) {
        audioRef.current?.pause();
        setPlayingIndex(null);
        setIsPlaying(false);
      } else if (playingIndex != null && playingIndex > index) {
        setPlayingIndex(playingIndex - 1);
      }

      if (selectedMediaIndex === index) {
        setSelectedMediaIndex(null);
      } else if (selectedMediaIndex != null && selectedMediaIndex > index) {
        setSelectedMediaIndex(selectedMediaIndex - 1);
      }

      const updatedList = mediaList.filter((_, i) => i !== index);
      setMediaList(updatedList);

      onGenerated({
        script: editableScript,
        speed: selectedSpeed,
        emotion: selectedEmotion,
        media: updatedList,
      });
      log.info("handleDeleteRow", "media deleted", { index });
    },
    [mediaList, playingIndex, selectedMediaIndex, editableScript, selectedSpeed, selectedEmotion, onGenerated],
  );

  // -- Audio ended handler --------------------------------------------------
  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
    setPlayingIndex(null);
    log.debug("handleAudioEnded", "playback finished");
  }, []);

  // -- Render ---------------------------------------------------------------
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Generate Narration</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Media list section */}
          <div className="max-h-[200px] overflow-y-auto rounded-lg border">
            {mediaList.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No narration generated yet
              </div>
            ) : (
              mediaList.map((media, index) => {
                const voiceLabel = getVoiceLabel(media.voice_id);
                const isHighlighted = index === selectedMediaIndex;
                const isThisPlaying = playingIndex === index && isPlaying;

                return (
                  <div
                    key={`${index}-${media.url}`}
                    onClick={() => handleSelectRow(index)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50",
                      isHighlighted &&
                        "border-l-3 border-primary bg-primary/10 shadow-[inset_0_0_0_1px] shadow-primary/20",
                    )}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayRow(index);
                      }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20"
                    >
                      {isThisPlaying ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="ml-0.5 h-3 w-3" />
                      )}
                    </button>
                    <span
                      className={cn(
                        "flex-1 text-sm font-medium",
                        isHighlighted && "text-primary",
                        !media.voice_id && "italic text-muted-foreground",
                      )}
                    >
                      {voiceLabel}
                    </span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {formatDuration(durations[media.url])}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRow(index);
                      }}
                      className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Hidden audio element */}
          <audio ref={audioRef} onEnded={handleAudioEnded} className="hidden" />

          {/* Generate button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!editableScript.trim() || !selectedVoice || isGenerating}
              className="flex items-center gap-2 rounded-lg bg-primary px-8 py-2.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {isGenerating ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isGenerating ? "Generating..." : "Generate"}
            </button>
          </div>

          {/* Voice + Emotion selectors (2-column) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Voice
              </Label>
              <Select
                value={selectedVoice}
                onValueChange={handleVoiceChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_OPTIONS.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Emotion
              </Label>
              <Select
                value={selectedEmotion}
                onValueChange={setSelectedEmotion}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMOTION_OPTIONS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Speed chips */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Speed
            </Label>
            <div className="flex items-center gap-2">
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedSpeed(opt.value)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                    selectedSpeed === opt.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Script textarea */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Script
            </Label>
            <textarea
              value={editableScript}
              onChange={(e) => setEditableScript(e.target.value)}
              placeholder="Enter narration script..."
              rows={4}
              className="w-full min-h-[100px] resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Narration script"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
