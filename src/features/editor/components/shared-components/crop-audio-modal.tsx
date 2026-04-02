"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scissors, Play, Pause, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createLogger } from "@/utils/logger";
import { uploadAudioToStorage } from "@/apis/storage-api";

const log = createLogger("Editor", "CropAudioModal");

// Layout constants
const MIN_DURATION = 0.5;
const WAVEFORM_BARS = 300;
const WAVEFORM_HEIGHT = 120;
const HANDLE_WIDTH = 12;
const HANDLE_HIT_ZONE = 16;
const DIMMED_OPACITY = 0.3;

export interface CropAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioName: string;
  mediaUrl: string;
  onCropComplete: (newMediaUrl: string) => void;
}

// === Helpers ===

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseTimeString(str: string): number | null {
  const match = str.match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const secs = parseInt(match[2], 10);
  if (secs >= 60) return null;
  return minutes * 60 + secs;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Encode Float32 PCM samples (single channel) as a WAV ArrayBuffer. */
function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);                                        // chunk size
  view.setUint16(20, 1, true);                                         // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true);              // block align
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = clamp(samples[i], -1, 1);
    view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
    offset += 2;
  }

  return buffer;
}

// === Main Component ===

export function CropAudioModal({
  isOpen,
  onClose,
  audioName,
  mediaUrl,
  onCropComplete,
}: CropAudioModalProps) {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isCropping, setIsCropping] = useState(false);
  const [startInput, setStartInput] = useState("00:00");
  const [endInput, setEndInput] = useState("00:00");

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const draggingHandleRef = useRef<"start" | "end" | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = isOpen;
    return () => {
      mountedRef.current = false;
    };
  }, [isOpen]);

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(animationFrameRef.current);
    try { sourceNodeRef.current?.stop(); } catch { /* already stopped */ }
    sourceNodeRef.current = null;
  }, []);

  // Abort in-flight requests and stop audio on close
  useEffect(() => {
    if (!isOpen) {
      abortControllerRef.current?.abort();
      stopPlayback();
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [isOpen, stopPlayback]);

  // Load and decode audio when modal opens
  useEffect(() => {
    if (!isOpen || !mediaUrl) return;

    setAudioBuffer(null);
    setIsLoading(true);
    setLoadError(false);
    setStartTime(0);
    setEndTime(0);
    setDuration(0);
    setIsPlaying(false);
    setCurrentTime(0);
    setStartInput("00:00");
    setEndInput("00:00");

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;

    log.info("useEffect[load]", "loading audio", { mediaUrl });

    (async () => {
      try {
        const response = await fetch(mediaUrl, { signal: abortController.signal });
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);

        if (!mountedRef.current) return;

        const dur = decoded.duration;
        setAudioBuffer(decoded);
        setDuration(dur);
        setEndTime(dur);
        setEndInput(formatTime(dur));
        log.info("useEffect[load]", "decoded", { duration: dur, sampleRate: decoded.sampleRate });
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof Error && err.name === "AbortError") return;
        log.error("useEffect[load]", "failed", { error: String(err) });
        setLoadError(true);
        toast.error("Failed to load audio");
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    })();

    return () => abortController.abort();
  }, [isOpen, mediaUrl]);

  // Downsample channel 0 to WAVEFORM_BARS amplitude values [0..1]
  const waveformData = useMemo(() => {
    if (!audioBuffer) return [];
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / WAVEFORM_BARS);
    const data: number[] = [];
    for (let i = 0; i < WAVEFORM_BARS; i++) {
      const start = i * blockSize;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) sum += Math.abs(channelData[start + j]);
      data.push(sum / blockSize);
    }
    const max = Math.max(...data, 0.001);
    return data.map((v) => v / max);
  }, [audioBuffer]);

  // Render waveform, handles, and playback cursor on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0 || duration === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.offsetWidth;
    const displayHeight = WAVEFORM_HEIGHT;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const centerY = displayHeight / 2;
    const startX = (startTime / duration) * displayWidth;
    const endX = (endTime / duration) * displayWidth;
    const stride = displayWidth / WAVEFORM_BARS;

    // Waveform bars — dimmed outside selected range
    for (let i = 0; i < WAVEFORM_BARS; i++) {
      const x = i * stride;
      const barW = Math.max(1, stride - 1);
      const barHeight = Math.max(2, waveformData[i] * (displayHeight / 2));
      const inRange = x >= startX && x <= endX;

      ctx.globalAlpha = inRange ? 1.0 : DIMMED_OPACITY;
      ctx.fillStyle = inRange ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
      ctx.fillRect(x, centerY - barHeight / 2, barW, barHeight);
    }
    ctx.globalAlpha = 1.0;

    // Start handle — [ bracket
    ctx.fillStyle = "hsl(var(--primary))";
    ctx.fillRect(startX - 1, 0, 3, displayHeight);
    ctx.fillRect(startX - 1, 0, HANDLE_WIDTH, 3);
    ctx.fillRect(startX - 1, displayHeight - 3, HANDLE_WIDTH, 3);

    // End handle — ] bracket
    ctx.fillRect(endX - 2, 0, 3, displayHeight);
    ctx.fillRect(endX - HANDLE_WIDTH + 2, 0, HANDLE_WIDTH, 3);
    ctx.fillRect(endX - HANDLE_WIDTH + 2, displayHeight - 3, HANDLE_WIDTH, 3);

    // Playback cursor — always show at currentTime (tracks startTime when not playing)
    if (duration > 0) {
      const cursorX = (currentTime / duration) * displayWidth;
      ctx.fillStyle = "hsl(var(--destructive))";
      ctx.globalAlpha = 0.8;
      ctx.fillRect(cursorX - 1, 0, 2, displayHeight);
      ctx.globalAlpha = 1.0;
    }
  }, [waveformData, startTime, endTime, currentTime, duration]);

  // === Draggable handles (Pointer Events) ===

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !audioBuffer || duration === 0) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const startHandleX = (startTime / duration) * rect.width;
      const endHandleX = (endTime / duration) * rect.width;
      const distStart = Math.abs(x - startHandleX);
      const distEnd = Math.abs(x - endHandleX);

      let handle: "start" | "end" | null = null;
      if (distStart <= HANDLE_HIT_ZONE && distEnd <= HANDLE_HIT_ZONE) {
        handle = distStart <= distEnd ? "start" : "end";
      } else if (distStart <= HANDLE_HIT_ZONE) {
        handle = "start";
      } else if (distEnd <= HANDLE_HIT_ZONE) {
        handle = "end";
      }

      if (handle) {
        draggingHandleRef.current = handle;
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    },
    [startTime, endTime, duration, audioBuffer]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingHandleRef.current || !canvasRef.current || duration === 0) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const time = (x / rect.width) * duration;

      if (draggingHandleRef.current === "start") {
        const newStart = clamp(time, 0, endTime - MIN_DURATION);
        setStartTime(newStart);
        setStartInput(formatTime(newStart));
        if (!isPlaying) setCurrentTime(newStart);
      } else {
        const newEnd = clamp(time, startTime + MIN_DURATION, duration);
        setEndTime(newEnd);
        setEndInput(formatTime(newEnd));
      }

      if (isPlaying) {
        stopPlayback();
        setIsPlaying(false);
      }
    },
    [duration, endTime, startTime, isPlaying, stopPlayback]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (draggingHandleRef.current) {
        draggingHandleRef.current = null;
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
      }
    },
    []
  );

  // === Time input blur handlers (validate on blur, revert on invalid) ===

  const handleStartBlur = useCallback(() => {
    const parsed = parseTimeString(startInput);
    if (parsed === null) {
      setStartInput(formatTime(startTime));
      return;
    }
    const clamped = clamp(parsed, 0, endTime - MIN_DURATION);
    setStartTime(clamped);
    setStartInput(formatTime(clamped));
  }, [startInput, startTime, endTime]);

  const handleEndBlur = useCallback(() => {
    const parsed = parseTimeString(endInput);
    if (parsed === null) {
      setEndInput(formatTime(endTime));
      return;
    }
    const clamped = clamp(parsed, startTime + MIN_DURATION, duration);
    setEndTime(clamped);
    setEndInput(formatTime(clamped));
  }, [endInput, endTime, startTime, duration]);

  // === Playback ===

  const handlePlayPause = useCallback(() => {
    if (!audioBuffer || !audioContextRef.current) return;
    const audioCtx = audioContextRef.current;

    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
      setCurrentTime(startTime);
      return;
    }

    audioCtx.resume().then(() => {
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      sourceNodeRef.current = source;

      source.start(0, startTime, endTime - startTime);
      const startedAt = audioCtx.currentTime;

      source.onended = () => {
        if (!mountedRef.current) return;
        cancelAnimationFrame(animationFrameRef.current);
        setIsPlaying(false);
        setCurrentTime(startTime);
      };

      const tick = () => {
        if (!mountedRef.current) return;
        const elapsed = audioCtx.currentTime - startedAt;
        const ct = clamp(startTime + elapsed, startTime, endTime);
        setCurrentTime(ct);
        if (ct < endTime) animationFrameRef.current = requestAnimationFrame(tick);
      };
      animationFrameRef.current = requestAnimationFrame(tick);
      setIsPlaying(true);
      log.debug("handlePlayPause", "started", { startTime, endTime });
    });
  }, [audioBuffer, isPlaying, startTime, endTime, stopPlayback]);

  // Keep cursor at startTime when not playing; stop playback if start/end changes during play
  useEffect(() => {
    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
    }
    setCurrentTime(startTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, endTime]);

  // === Crop flow ===

  const handleCrop = useCallback(async () => {
    if (!audioBuffer || isCropping) return;
    log.info("handleCrop", "start", { startTime, endTime, duration: endTime - startTime });

    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
    }

    setIsCropping(true);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Trim AudioBuffer
      const { sampleRate, numberOfChannels } = audioBuffer;
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.floor(endTime * sampleRate);
      const length = endSample - startSample;

      const trimmed = new AudioBuffer({ length, sampleRate, numberOfChannels });
      for (let ch = 0; ch < numberOfChannels; ch++) {
        trimmed.copyToChannel(
          audioBuffer.getChannelData(ch).subarray(startSample, endSample),
          ch,
          0
        );
      }

      // Encode WAV — channel 0 only (design decision: mono output)
      const wavBuffer = encodeWAV(trimmed.getChannelData(0), sampleRate);
      const blob = new Blob([wavBuffer], { type: "audio/wav" });
      const file = new File([blob], "cropped.wav", { type: "audio/wav" });

      log.info("handleCrop", "uploading", { size: file.size });
      const { publicUrl } = await uploadAudioToStorage(file, "audio-objects");

      if (!mountedRef.current) return;

      log.info("handleCrop", "complete", { publicUrl });
      onCropComplete(publicUrl);
      onClose();
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      log.error("handleCrop", "failed", { error: String(err) });
      toast.error("Failed to upload cropped audio");
    } finally {
      if (mountedRef.current) setIsCropping(false);
    }
  }, [audioBuffer, startTime, endTime, isPlaying, isCropping, stopPlayback, onCropComplete, onClose]);

  const handleClose = useCallback(() => {
    if (isPlaying) { stopPlayback(); setIsPlaying(false); }
    abortControllerRef.current?.abort();
    onClose();
  }, [isPlaying, stopPlayback, onClose]);

  const selectedDuration = endTime - startTime;
  const canCrop = audioBuffer !== null && !loadError && selectedDuration >= MIN_DURATION && !isCropping;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Crop Audio: {audioName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Waveform canvas */}
          <div className="bg-muted/30 rounded-lg p-3">
            {isLoading && (
              <div className="flex items-center justify-center" style={{ height: WAVEFORM_HEIGHT }}>
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            {loadError && !isLoading && (
              <div
                className="flex items-center justify-center text-sm text-destructive"
                style={{ height: WAVEFORM_HEIGHT }}
              >
                Failed to load audio. Please close and try again.
              </div>
            )}
            {!isLoading && !loadError && waveformData.length > 0 && (
              <canvas
                ref={canvasRef}
                className="w-full cursor-pointer touch-none select-none"
                style={{ height: WAVEFORM_HEIGHT }}
                aria-label="Audio waveform. Drag handles to select crop range."
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
            )}
          </div>

          {/* Time controls + play button */}
          {audioBuffer && !loadError && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Start</span>
                <Input
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  onBlur={handleStartBlur}
                  className="w-20 text-center font-mono text-sm"
                  aria-label="Start time"
                  disabled={isCropping}
                />
              </div>

              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={handlePlayPause}
                disabled={isCropping}
                aria-label={isPlaying ? "Pause preview" : "Play preview"}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">End</span>
                <Input
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                  onBlur={handleEndBlur}
                  className="w-20 text-center font-mono text-sm"
                  aria-label="End time"
                  disabled={isCropping}
                />
              </div>
            </div>
          )}

          {/* Duration info */}
          {audioBuffer && !loadError && (
            <p className="text-xs text-muted-foreground text-center">
              Selected: {formatTime(selectedDuration)} / Total: {formatTime(duration)}
            </p>
          )}

          {/* Crop button */}
          <Button
            onClick={handleCrop}
            disabled={!canCrop}
            className="w-full"
            size="lg"
            aria-label="Crop audio"
          >
            {isCropping ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cropping...
              </>
            ) : (
              <>
                <Scissors className="h-4 w-4 mr-2" />
                Crop Audio
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
