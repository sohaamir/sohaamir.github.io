import type { Page } from '@playwright/test';

// First-load `ready` under 4 parallel SwiftShader workers can exceed 5 s even though
// each spec passes alone. E2e checks behaviour, not load time: real latency is
// measured on the GPU by tools/perf-probe.mjs and guarded by check:budget.
export const READY_TIMEOUT = 15_000;

export const ready = (page: Page) =>
  page.waitForFunction(() => window.__room?.ready === true, null, { timeout: READY_TIMEOUT });
