import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  useGenerateModalFlow,
  type GenerateOutcome,
} from '../use-generate-modal-flow';
import type { AudioResource } from '../../types';

interface FakeForm {
  description: string;
}
interface FakeResult {
  url: string;
}

const okValidator = (form: FakeForm) => {
  const errors: Record<string, string> = {};
  if (form.description.length < 5) errors.description = 'too short';
  return { isValid: Object.keys(errors).length === 0, errors };
};

const fakeSavedAudio: AudioResource = {
  id: 'saved-1',
  name: 'X',
  description: null,
  mediaUrl: 'https://x/1.mp3',
  loop: false,
  duration: 1000,
  influence: null,
  tags: null,
  source: 1,
  createdAt: '2026-01-01',
};

describe('useGenerateModalFlow', () => {
  it('initial state is idle', () => {
    const { result } = renderHook(() =>
      useGenerateModalFlow<FakeForm, FakeResult>({
        initialForm: { description: '' },
        validate: okValidator,
        generate: async () => ({ success: true, data: { url: 'x' } }),
        save: async () => fakeSavedAudio,
      }),
    );
    expect(result.current.step).toBe('idle');
    expect(result.current.hasResult).toBe(false);
    expect(result.current.isWorking).toBe(false);
    expect(result.current.showValidation).toBe(false);
  });

  it('invalid form sets showValidation, no generate call', async () => {
    const generate = vi.fn();
    const { result } = renderHook(() =>
      useGenerateModalFlow<FakeForm, FakeResult>({
        initialForm: { description: '' },
        validate: okValidator,
        generate,
        save: async () => fakeSavedAudio,
      }),
    );
    await act(async () => {
      await result.current.handleGenerate();
    });
    expect(result.current.showValidation).toBe(true);
    expect(result.current.step).toBe('idle');
    expect(generate).not.toHaveBeenCalled();
  });

  it('happy path: idle → generating → audition → saving → onSaved called', async () => {
    const generate = vi.fn(
      async (): Promise<GenerateOutcome<FakeResult>> => ({
        success: true,
        data: { url: 'https://x/1.mp3' },
      }),
    );
    const save = vi.fn(async () => fakeSavedAudio);
    const onSaved = vi.fn();

    const { result } = renderHook(() =>
      useGenerateModalFlow<FakeForm, FakeResult>({
        initialForm: { description: 'long enough' },
        validate: okValidator,
        generate,
        save,
        onSaved,
      }),
    );

    await act(async () => {
      await result.current.handleGenerate();
    });
    expect(generate).toHaveBeenCalledTimes(1);
    const firstCall = generate.mock.calls[0] as unknown as [FakeForm, { seed?: number }];
    expect(firstCall[1]).toEqual({ seed: undefined });
    expect(result.current.step).toBe('audition');
    expect(result.current.hasResult).toBe(true);

    await act(async () => {
      await result.current.handleSave();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(fakeSavedAudio);
  });

  it('regenerate after audition forces seed (Date.now())', async () => {
    const generate = vi.fn(
      async (): Promise<GenerateOutcome<FakeResult>> => ({
        success: true,
        data: { url: 'https://x/1.mp3' },
      }),
    );

    const { result } = renderHook(() =>
      useGenerateModalFlow<FakeForm, FakeResult>({
        initialForm: { description: 'long enough' },
        validate: okValidator,
        generate,
        save: async () => fakeSavedAudio,
      }),
    );

    await act(async () => {
      await result.current.handleGenerate();
    });
    expect(result.current.step).toBe('audition');

    await act(async () => {
      await result.current.handleGenerate();
    });
    expect(generate).toHaveBeenCalledTimes(2);
    const secondCall = generate.mock.calls[1] as unknown as [FakeForm, { seed?: number }];
    expect(typeof secondCall[1].seed).toBe('number');
    expect(secondCall[1].seed).toBeGreaterThan(0);
  });

  it('generate failure rolls back to idle when no prior result', async () => {
    const generate = vi.fn(
      async (): Promise<GenerateOutcome<FakeResult>> => ({
        success: false,
        error: { code: 'X', message: 'Y' },
      }),
    );
    const { result } = renderHook(() =>
      useGenerateModalFlow<FakeForm, FakeResult>({
        initialForm: { description: 'long enough' },
        validate: okValidator,
        generate,
        save: async () => fakeSavedAudio,
      }),
    );
    await act(async () => {
      await result.current.handleGenerate();
    });
    expect(result.current.step).toBe('idle');
    expect(result.current.error?.code).toBe('X');
  });

  it('generate failure rolls back to audition when had prior result', async () => {
    let seq = 0;
    const generate = vi.fn(async (): Promise<GenerateOutcome<FakeResult>> => {
      seq += 1;
      if (seq === 1) return { success: true, data: { url: 'a' } };
      return { success: false, error: { code: 'E', message: 'm' } };
    });
    const { result } = renderHook(() =>
      useGenerateModalFlow<FakeForm, FakeResult>({
        initialForm: { description: 'long enough' },
        validate: okValidator,
        generate,
        save: async () => fakeSavedAudio,
      }),
    );
    await act(async () => {
      await result.current.handleGenerate();
    });
    await act(async () => {
      await result.current.handleGenerate();
    });
    expect(result.current.step).toBe('audition');
    expect(result.current.error?.code).toBe('E');
  });

  it('save failure goes back to audition with error', async () => {
    const generate = vi.fn(
      async (): Promise<GenerateOutcome<FakeResult>> => ({
        success: true,
        data: { url: 'x' },
      }),
    );
    const save = vi.fn(async () => {
      throw new Error('boom');
    });
    const { result } = renderHook(() =>
      useGenerateModalFlow<FakeForm, FakeResult>({
        initialForm: { description: 'long enough' },
        validate: okValidator,
        generate,
        save,
      }),
    );
    await act(async () => {
      await result.current.handleGenerate();
    });
    await act(async () => {
      await result.current.handleSave();
    });
    expect(result.current.step).toBe('audition');
    expect(result.current.error?.message).toBe('boom');
  });

  it('handleDismiss is blocked while generating', async () => {
    let resolveGen: ((v: GenerateOutcome<FakeResult>) => void) | null = null;
    const generate = vi.fn(
      () =>
        new Promise<GenerateOutcome<FakeResult>>((res) => {
          resolveGen = res;
        }),
    );
    const onClose = vi.fn();

    const { result } = renderHook(() =>
      useGenerateModalFlow<FakeForm, FakeResult>({
        initialForm: { description: 'long enough' },
        validate: okValidator,
        generate,
        save: async () => fakeSavedAudio,
      }),
    );

    let pending: Promise<void>;
    act(() => {
      pending = result.current.handleGenerate();
    });
    await waitFor(() => expect(result.current.step).toBe('generating'));

    act(() => {
      result.current.handleDismiss(false, onClose);
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      resolveGen!({ success: true, data: { url: 'x' } });
      await pending!;
    });

    act(() => {
      result.current.handleDismiss(false, onClose);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reset clears state back to initial', async () => {
    const { result } = renderHook(() =>
      useGenerateModalFlow<FakeForm, FakeResult>({
        initialForm: { description: '' },
        validate: okValidator,
        generate: async () => ({ success: true, data: { url: 'x' } }),
        save: async () => fakeSavedAudio,
      }),
    );
    act(() => {
      result.current.setForm({ description: 'changed' });
    });
    expect(result.current.form.description).toBe('changed');
    act(() => {
      result.current.reset();
    });
    expect(result.current.form.description).toBe('');
  });
});
