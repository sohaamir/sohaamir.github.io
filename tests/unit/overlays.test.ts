import { describe, expect, it } from 'vitest';
import { overlayFor } from '../../src/scene/overlays';
import type { RoomState } from '../../src/scene/state';

const s = (beat: RoomState['beat'], moving = false): RoomState => ({ beat, highlighted: 0, moving });

describe('overlayFor', () => {
  it('arrive: "take a seat" (selects the couch) and the skip link', () => {
    expect(overlayFor(s('arrive'))).toEqual({ prompt: { text: 'take a seat', target: 'couch' }, skip: true, remote: false });
  });

  it('seated: "pick up the remote" (selects the remote), no skip link', () => {
    expect(overlayFor(s('seated'))).toEqual({ prompt: { text: 'pick up the remote', target: 'remote' }, skip: false, remote: false });
  });

  it('tv: no prompt, the on-screen remote', () => {
    expect(overlayFor(s('tv'))).toEqual({ prompt: null, skip: false, remote: true });
  });

  it('while the camera moves the prompt fades out', () => {
    expect(overlayFor(s('seated', true)).prompt).toBeNull();
    expect(overlayFor(s('tv', true)).prompt).toBeNull();
    // ...and the on-screen remote is hidden mid-move (the glide in, the dive out).
    expect(overlayFor(s('tv', true)).remote).toBe(false);
  });
});
