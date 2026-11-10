import { describe, expect, it } from 'vitest';
import { createLimiter, fulfilled, mapLimit } from '../src/lib/concurrency';

describe('concurrency helpers', () => {
  it('never runs more than the limit at once and keeps result order', async () => {
    let active = 0; let peak = 0;
    const results = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 4 - (n % 3)));
      active -= 1;
      return n * 2;
    });
    expect(peak).toBe(3);
    expect(fulfilled(results)).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });
  it('isolates failures instead of aborting the batch', async () => {
    const results = await mapLimit([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error('x'); return n; });
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(fulfilled(results)).toEqual([1, 3]);
  });
  it('keeps serving queued tasks after one rejects', async () => {
    const run = createLimiter(1);
    const failing = run(async () => { throw new Error('nope'); });
    const next = run(async () => 'ok');
    await expect(failing).rejects.toThrow('nope');
    await expect(next).resolves.toBe('ok');
  });
});
