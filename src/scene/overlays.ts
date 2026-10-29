import type { RoomState } from './state';

export type Overlay = {
  prompt: { text: string; target: 'couch' | 'remote' } | null;
  skip: boolean;
  /** The on-screen remote (touch only; bindOverlays also checks for a coarse pointer). */
  remote: boolean;
};

/** What the HTML overlays (Prompt, SkipLink, OnScreenRemote) show for a state (spec §3.1–3.3, §3.6). */
export function overlayFor(s: RoomState): Overlay {
  const skip = s.beat === 'arrive';
  const remote = s.beat === 'tv' && !s.moving;
  if (s.moving) return { prompt: null, skip, remote };
  if (s.beat === 'arrive') return { prompt: { text: 'take a seat', target: 'couch' }, skip, remote };
  if (s.beat === 'seated') return { prompt: { text: 'pick up the remote', target: 'remote' }, skip, remote };
  return { prompt: null, skip, remote };
}

/**
 * Bind the overlays in the page. Returns an update function to call on every
 * state change; the prompt button dispatches the same `select` as clicking the
 * object it names, so the prompt is also a keyboard/screen-reader control.
 * The on-screen remote's 1–6 call `onChannel(index)`; its ⌂ is a no-op at the
 * tv beat (the only beat it is shown in).
 */
export function bindOverlays(
  onSelect: (target: 'couch' | 'remote') => void,
  onChannel: (index: number) => void = () => {},
): (s: RoomState) => void {
  const promptBox = document.querySelector<HTMLElement>('[data-room-prompt]');
  const promptButton = promptBox?.querySelector<HTMLButtonElement>('button') ?? null;
  const skip = document.querySelector<HTMLElement>('[data-room-skip]');
  const remote = document.querySelector<HTMLElement>('[data-room-remote]');
  const coarse = matchMedia('(pointer: coarse)');
  let target: 'couch' | 'remote' | null = null;

  promptButton?.addEventListener('click', () => {
    if (target) onSelect(target);
  });
  remote?.querySelectorAll<HTMLButtonElement>('[data-channel]').forEach((b) => {
    b.addEventListener('click', () => onChannel(Number(b.dataset.channel)));
  });

  return (s) => {
    const o = overlayFor(s);
    target = o.prompt?.target ?? null;
    // Keep the last text while fading out, so it doesn't vanish mid-fade.
    if (promptButton && o.prompt) promptButton.textContent = o.prompt.text;
    promptBox?.toggleAttribute('data-show', !!o.prompt);
    skip?.toggleAttribute('data-show', o.skip);
    remote?.toggleAttribute('data-show', o.remote && coarse.matches);
  };
}
