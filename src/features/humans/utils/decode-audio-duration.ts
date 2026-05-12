// decode-audio-duration.ts — Probe duration of an audio Blob/URL via a temp <Audio>.

export function decodeAudioDuration(source: Blob | string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    let objectUrl: string | null = null;
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
      audio.src = '';
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    const onLoaded = () => {
      const seconds = audio.duration;
      cleanup();
      if (!Number.isFinite(seconds) || seconds <= 0) {
        reject(new Error('Invalid audio duration'));
        return;
      }
      resolve(Math.round(seconds * 1000));
    };
    const onError = () => {
      cleanup();
      reject(new Error('Failed to decode audio'));
    };
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);
    if (typeof source === 'string') {
      audio.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      audio.src = objectUrl;
    }
  });
}
