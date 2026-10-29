import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mesh, PerspectiveCamera, PlaneGeometry, Vector3 } from 'three';
import { dive, diveOpacity } from '../../src/scene/dive';

afterEach(() => vi.unstubAllGlobals());

describe('diveOpacity', () => {
  it('starts clear, ends fully blue, never goes backwards', () => {
    expect(diveOpacity(0)).toBe(0);
    expect(diveOpacity(1)).toBe(1);
    let last = 0;
    for (let k = 0; k <= 1; k += 0.05) {
      expect(diveOpacity(k)).toBeGreaterThanOrEqual(last);
      last = diveOpacity(k);
    }
  });
});

describe('dive', () => {
  it('pushes the camera up to the screen, fades the overlay in, then marks Back as the menu and navigates', async () => {
    let now = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb((now += 100)), 0));
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const camera = new PerspectiveCamera();
    camera.position.set(0, 1.1, -1.05);
    const screen = new Mesh(new PlaneGeometry(1.5, 0.84));
    screen.position.set(0, 1.07, -2.744);
    screen.updateMatrixWorld();
    const overlay = { style: { opacity: '', transition: '' } };
    const calls: string[] = [];

    await dive(camera, screen, '/cv/', {
      overlay: overlay as unknown as HTMLElement,
      replaceUrl: (u) => calls.push(`replace ${u}`),
      navigate: (u) => calls.push(`go ${u}`),
    });

    expect(camera.position.distanceTo(new Vector3(0, 1.07, -2.744))).toBeLessThan(0.1);
    expect(overlay.style.opacity).toBe('1');
    expect(calls).toEqual(['replace /?tv=1', 'go /cv/']);
  });
});

describe('dive timing', () => {
  it('takes ~0.7 s from its first frame to navigation', async () => {
    let now = 0;
    let queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const tick = (ms: number) => {
      now += ms;
      const run = queue;
      queue = [];
      run.forEach((cb) => cb(now));
    };

    const camera = new PerspectiveCamera();
    camera.position.set(0, 1.1, -1.05);
    const screen = new Mesh(new PlaneGeometry(1.5, 0.84));
    screen.position.set(0, 1.07, -2.744);
    screen.updateMatrixWorld();
    const calls: string[] = [];
    void dive(camera, screen, '/cv/', { overlay: null, replaceUrl: () => {}, navigate: (u) => calls.push(u) });

    tick(16);
    for (let i = 0; i < 40; i++) tick(16); // 640 ms after the first frame
    expect(calls).toEqual([]);
    for (let i = 0; i < 5; i++) tick(16); // 720 ms
    expect(calls).toEqual(['/cv/']);
  });
});
