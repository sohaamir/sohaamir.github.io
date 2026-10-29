import { channelByKey } from '../lib/channels';
import { withBase } from '../lib/url';

export interface KeyInfo {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  targetIsEditable: boolean;
}

export type ChannelKeyAction = { type: 'go'; path: string } | { type: 'menu' } | null;

/** Pure: decide what a keypress means. `path` is site-relative (apply withBase before use). */
export function channelKeyAction(e: KeyInfo): ChannelKeyAction {
  if (e.metaKey || e.ctrlKey || e.altKey || e.targetIsEditable) return null;
  if (e.key === 'Escape' || e.key === '0') return { type: 'menu' };
  const channel = channelByKey(e.key);
  return channel ? { type: 'go', path: channel.path } : null;
}

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    t.isContentEditable
  );
}

/** Wire keydown on the document: number keys switch channel, Esc/0 return to the menu. */
export function attachChannelKeys(): void {
  document.addEventListener('keydown', (ev) => {
    const action = channelKeyAction({
      key: ev.key,
      metaKey: ev.metaKey,
      ctrlKey: ev.ctrlKey,
      altKey: ev.altKey,
      targetIsEditable: isEditable(ev.target),
    });
    if (!action) return;
    ev.preventDefault();
    location.href = action.type === 'menu' ? withBase('/?tv=1') : withBase(action.path);
  });
}
