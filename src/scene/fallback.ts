import { attachChannelKeys } from '../scripts/channel-keys';

/** True when a throwaway canvas can create a WebGL2 or WebGL context (probed before any scene is built). */
export function hasWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

let shown = false;

/**
 * Switch the home page to its 2D form: the canvas and room overlays are hidden by
 * CSS (html.no-webgl, see NoWebGL.astro), the Channels nav becomes the visible
 * menu, and the digit keys navigate like on the channel pages.
 */
export function showNoWebGL(): void {
  if (shown) return;
  shown = true;
  document.documentElement.classList.add('no-webgl');
  attachChannelKeys();
}
