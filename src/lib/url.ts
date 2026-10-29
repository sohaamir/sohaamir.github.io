/** Join a base URL and a path, collapsing duplicate slashes. Pure; testable. */
export function joinBase(base: string, path: string): string {
  const joined = `${base}/${path}`.replace(/\/{2,}/g, '/');
  return joined.startsWith('/') ? joined : `/${joined}`;
}

/** Prefix a site path with the configured base (`/` in prod, `/new_website/` on staging). */
export function withBase(path: string): string {
  return joinBase(import.meta.env?.BASE_URL ?? '/', path);
}
