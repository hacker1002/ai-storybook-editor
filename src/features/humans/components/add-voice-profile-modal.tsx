// add-voice-profile-modal.tsx — Modal: upload or record voice sample → add voice profile.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Mic, MicOff, Square, Upload, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField } from '@/features/humans/components/shared/form-field';
import { pickSupportedMimeType } from '@/features/humans/utils/pick-supported-mime-type';
import { decodeAudioDuration } from '@/features/humans/utils/decode-audio-duration';
import {
  RECORDING_SCRIPTS,
  DEFAULT_RECORDING_SCRIPT_CODE,
  getRecordingScript,
} from '@/features/humans/constants/recording-script';
import {
  uploadHumanAudio,
  removeHumanStorageObjects,
} from '@/apis/human-api';
import type { VoiceProfile } from '@/types/human';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Humans', 'AddVoiceProfileModal');

const MAX_AUDIO_SIZE = 20 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/x-m4a',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
];
const RECORD_MIN_DURATION_MS = 30_000;
const RECORD_MAX_DURATION_MS = 3_600_000;
const MIC_TEST_MAX_DURATION_MS = 10_000;

type Step = 'form' | 'recording' | 'preview' | 'uploading';
type SourceTab = 'upload' | 'record';

interface AddVoiceProfileModalProps {
  defaultName: string;
  humanId: string;
  onClose: () => void;
  onAdded: (profile: VoiceProfile) => Promise<void>;
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function AddVoiceProfileModal({
  defaultName,
  humanId,
  onClose,
  onAdded,
}: AddVoiceProfileModalProps) {
  const mediaRecorderAvailable = typeof MediaRecorder !== 'undefined';

  const [tab, setTab] = useState<SourceTab>('upload');
  const [name, setName] = useState(defaultName);
  const [ageRaw, setAgeRaw] = useState<string>('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMime, setAudioMime] = useState<string | null>(null);
  const [audioDurationMs, setAudioDurationMs] = useState<number | null>(null);
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [scriptLang, setScriptLang] = useState<string>(DEFAULT_RECORDING_SCRIPT_CODE);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerIdRef = useRef<number | null>(null);
  const autoStopTimeoutRef = useRef<number | null>(null);

  const testStreamRef = useRef<MediaStream | null>(null);
  const testAudioCtxRef = useRef<AudioContext | null>(null);
  const testAnalyserRef = useRef<AnalyserNode | null>(null);
  const testRafRef = useRef<number | null>(null);
  const testAutoStopRef = useRef<number | null>(null);

  const parsedAge = useMemo(() => {
    if (ageRaw.trim() === '') return null;
    const n = Number(ageRaw);
    if (!Number.isFinite(n)) return null;
    const i = Math.round(n);
    if (i < 0 || i > 120) return null;
    return i;
  }, [ageRaw]);

  const minMet = audioDurationMs !== null && audioDurationMs >= RECORD_MIN_DURATION_MS;
  const isValid =
    name.trim().length >= 1 &&
    name.trim().length <= 255 &&
    parsedAge !== null &&
    audioBlob !== null &&
    audioDurationMs !== null &&
    minMet;

  const clearAudioState = useCallback(() => {
    if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
    setAudioBlob(null);
    setAudioMime(null);
    setAudioDurationMs(null);
    setAudioObjectUrl(null);
    setRecordingDurationMs(0);
  }, [audioObjectUrl]);

  const stopMicTest = useCallback(() => {
    if (testRafRef.current !== null) {
      window.cancelAnimationFrame(testRafRef.current);
      testRafRef.current = null;
    }
    if (testAutoStopRef.current !== null) {
      window.clearTimeout(testAutoStopRef.current);
      testAutoStopRef.current = null;
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    if (testAudioCtxRef.current) {
      void testAudioCtxRef.current.close().catch(() => undefined);
      testAudioCtxRef.current = null;
    }
    testAnalyserRef.current = null;
    setMicLevel(0);
    setIsTestingMic(false);
  }, []);

  // Cleanup mic + timers on unmount.
  useEffect(() => {
    return () => {
      if (timerIdRef.current !== null) {
        window.cancelAnimationFrame(timerIdRef.current);
      }
      if (autoStopTimeoutRef.current !== null) {
        window.clearTimeout(autoStopTimeoutRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
      if (testRafRef.current !== null) {
        window.cancelAnimationFrame(testRafRef.current);
      }
      if (testAutoStopRef.current !== null) {
        window.clearTimeout(testAutoStopRef.current);
      }
      if (testStreamRef.current) {
        testStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (testAudioCtxRef.current) {
        void testAudioCtxRef.current.close().catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tickTimer = useCallback(() => {
    const elapsed = performance.now() - startedAtRef.current;
    setRecordingDurationMs(elapsed);
    timerIdRef.current = window.requestAnimationFrame(tickTimer);
  }, []);

  const stopTimer = () => {
    if (timerIdRef.current !== null) {
      window.cancelAnimationFrame(timerIdRef.current);
      timerIdRef.current = null;
    }
    if (autoStopTimeoutRef.current !== null) {
      window.clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = null;
    }
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const handleStartMicTest = async () => {
    if (isTestingMic) {
      stopMicTest();
      return;
    }
    log.info('handleStartMicTest', 'start');
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testStreamRef.current = stream;
      const AudioCtx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        log.warn('handleStartMicTest', 'AudioContext unavailable');
        stream.getTracks().forEach((t) => t.stop());
        testStreamRef.current = null;
        setError('Mic test not supported in this browser.');
        return;
      }
      const ctx = new AudioCtx();
      testAudioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      testAnalyserRef.current = analyser;
      const buffer = new Uint8Array(analyser.fftSize);
      setIsTestingMic(true);

      const tick = () => {
        const a = testAnalyserRef.current;
        if (!a) return;
        a.getByteTimeDomainData(buffer);
        let sumSq = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / buffer.length);
        setMicLevel(Math.min(1, rms * 2.5));
        testRafRef.current = window.requestAnimationFrame(tick);
      };
      testRafRef.current = window.requestAnimationFrame(tick);
      testAutoStopRef.current = window.setTimeout(stopMicTest, MIC_TEST_MAX_DURATION_MS);
    } catch (e) {
      log.warn('handleStartMicTest', 'getUserMedia failed', { error: String(e) });
      stopMicTest();
      setError('Microphone access denied. Check browser permissions.');
    }
  };

  const handleStartRecording = async () => {
    log.info('handleStartRecording', 'start');
    if (isTestingMic) stopMicTest();
    setError(null);
    const mime = pickSupportedMimeType();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stopTimer();
        stopStream();
        const finalMime = recorder.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        chunksRef.current = [];
        try {
          const durationMs = await decodeAudioDuration(blob);
          const url = URL.createObjectURL(blob);
          setAudioBlob(blob);
          setAudioMime(finalMime);
          setAudioDurationMs(durationMs);
          setAudioObjectUrl(url);
          setStep('preview');
          log.info('handleStartRecording', 'preview ready', { durationMs, size: blob.size });
        } catch (e) {
          log.error('handleStartRecording', 'duration decode failed', { error: String(e) });
          setError('Could not decode recording. Please try again.');
          setStep('form');
        }
      };
      startedAtRef.current = performance.now();
      setRecordingDurationMs(0);
      timerIdRef.current = window.requestAnimationFrame(tickTimer);
      autoStopTimeoutRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, RECORD_MAX_DURATION_MS);
      recorder.start();
      setStep('recording');
    } catch (e) {
      log.warn('handleStartRecording', 'getUserMedia failed', { error: String(e) });
      stopStream();
      setError('Microphone access denied. Please use the Upload tab instead.');
    }
  };

  const handleStopRecording = () => {
    log.info('handleStopRecording', 'stopping');
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') recorder.stop();
    else {
      stopTimer();
      stopStream();
    }
  };

  const handlePickFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
      setError(`Unsupported audio type: ${file.type || 'unknown'}`);
      return;
    }
    if (file.size > MAX_AUDIO_SIZE) {
      setError(`File too large (max ${MAX_AUDIO_SIZE / 1024 / 1024}MB)`);
      return;
    }
    try {
      const durationMs = await decodeAudioDuration(file);
      const url = URL.createObjectURL(file);
      clearAudioState();
      setAudioBlob(file);
      setAudioMime(file.type);
      setAudioDurationMs(durationMs);
      setAudioObjectUrl(url);
      setStep('preview');
    } catch (e) {
      log.error('handlePickFile', 'decode failed', { error: String(e) });
      setError('Failed to read audio file.');
    }
  };

  const handleDiscardPreview = () => {
    clearAudioState();
    setStep('form');
  };

  const handleTabChange = (next: string) => {
    if (step === 'recording' || step === 'uploading') return;
    clearAudioState();
    setStep('form');
    setTab(next as SourceTab);
  };

  const handleAdd = async () => {
    if (!isValid || !audioBlob || parsedAge === null) return;
    log.info('handleAdd', 'start', { size: audioBlob.size });
    setStep('uploading');
    setError(null);
    const uploadedPaths: string[] = [];
    try {
      const result = await uploadHumanAudio(humanId, audioBlob, audioMime ?? undefined);
      uploadedPaths.push(result.path);

      const profile: VoiceProfile = {
        clientId: genId(),
        name: name.trim(),
        age: parsedAge,
        recordUrl: result.publicUrl,
      };

      await onAdded(profile);
      log.info('handleAdd', 'done');
      onClose();
    } catch (e) {
      log.error('handleAdd', 'failed', { error: String(e) });
      if (uploadedPaths.length > 0) {
        await removeHumanStorageObjects(uploadedPaths).catch(() => undefined);
      }
      setError('Failed to add voice profile. Please try again.');
      setStep('form');
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (step === 'recording' || step === 'uploading') return;
    onClose();
  };

  const isBlocking = step === 'recording' || step === 'uploading';
  const remainingForMin =
    audioDurationMs === null ? null : Math.max(0, RECORD_MIN_DURATION_MS - audioDurationMs);

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Voice</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <FormField label="Name" required>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={255}
                disabled={isBlocking}
              />
            </FormField>
            <FormField label="Age" required>
              <Input
                type="number"
                min={0}
                max={120}
                step={1}
                value={ageRaw}
                onChange={(e) => setAgeRaw(e.target.value)}
                placeholder="0-120"
                disabled={isBlocking}
              />
            </FormField>
          </div>

          <Tabs value={tab} onValueChange={handleTabChange}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="upload" disabled={isBlocking}>Upload</TabsTrigger>
              <TabsTrigger value="record" disabled={isBlocking || !mediaRecorderAvailable}>
                Record
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="mt-3">
              <label
                className={cn(
                  'flex aspect-[3/1] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border text-center text-sm text-muted-foreground hover:border-primary hover:bg-accent',
                  isBlocking && 'cursor-not-allowed opacity-50',
                )}
              >
                <Upload className="h-5 w-5 mb-1" />
                <span className="font-medium">Click to upload audio</span>
                <span className="text-xs">MP3, WAV, M4A, OGG · ≤ 20MB</span>
                <input
                  type="file"
                  accept={ALLOWED_AUDIO_TYPES.join(',')}
                  hidden
                  disabled={isBlocking}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    void handlePickFile(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </TabsContent>
            <TabsContent value="record" className="mt-3 space-y-3">
              {!mediaRecorderAvailable ? (
                <p className="text-sm text-muted-foreground">
                  Your browser does not support audio recording. Use Upload instead.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Suggested Script
                    </span>
                    <Select value={scriptLang} onValueChange={setScriptLang} disabled={isBlocking}>
                      <SelectTrigger className="h-8 w-44 text-xs" aria-label="Script language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECORDING_SCRIPTS.map((opt) => (
                          <SelectItem key={opt.code} value={opt.code} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-line">
                    {getRecordingScript(scriptLang)}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                      {step === 'recording' ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="lg"
                          className="gap-2"
                          onClick={handleStopRecording}
                        >
                          <Square className="h-5 w-5" />
                          Stop
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="default"
                          size="lg"
                          className="gap-2"
                          onClick={handleStartRecording}
                          disabled={step === 'uploading' || isTestingMic}
                        >
                          <Circle className="h-5 w-5 text-destructive fill-destructive" />
                          Record
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant={isTestingMic ? 'secondary' : 'outline'}
                        size="lg"
                        className="gap-2"
                        onClick={handleStartMicTest}
                        disabled={step === 'recording' || step === 'uploading'}
                        aria-pressed={isTestingMic}
                      >
                        {isTestingMic ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                        {isTestingMic ? 'Stop Test' : 'Test Mic'}
                      </Button>
                    </div>
                    {isTestingMic ? (
                      <div
                        className="h-1.5 w-48 overflow-hidden rounded-full bg-muted"
                        role="meter"
                        aria-label="Microphone input level"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(micLevel * 100)}
                      >
                        <div
                          className="h-full bg-primary transition-[width] duration-75"
                          style={{ width: `${Math.round(micLevel * 100)}%` }}
                        />
                      </div>
                    ) : null}
                    <span className="text-sm font-mono text-muted-foreground tabular-nums">
                      {step === 'recording'
                        ? formatDuration(recordingDurationMs)
                        : audioDurationMs !== null
                          ? formatDuration(audioDurationMs)
                          : '00:00'}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mic className="h-3 w-3" />
                      {isTestingMic ? 'Speak to verify your microphone' : 'Minimum 30 seconds required'}
                    </span>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          {audioObjectUrl && step !== 'recording' ? (
            <div className="relative rounded-lg border border-border bg-card p-3">
              <button
                type="button"
                onClick={handleDiscardPreview}
                disabled={isBlocking}
                aria-label="Discard recording"
                className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              <audio controls preload="metadata" src={audioObjectUrl} className="w-full" />
              {!minMet && remainingForMin !== null ? (
                <p className="mt-2 text-xs text-destructive">
                  Need {Math.ceil(remainingForMin / 1000)}s more (min 30s).
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isBlocking}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleAdd}
            disabled={!isValid || isBlocking}
          >
            {step === 'uploading' ? 'Uploading…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
