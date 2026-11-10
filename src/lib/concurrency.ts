/** Runs at most `max` async tasks at once; extra tasks wait in FIFO order. */
export function createLimiter(max: number) {
  const limit = Math.max(1, Math.floor(max) || 1);
  let active = 0;
  const waiting: Array<() => void> = [];

  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active += 1;
        task().then(resolve, reject).finally(release);
      };
      if (active < limit) start();
      else waiting.push(start);
    });
  };
}

/** Like Promise.allSettled over a mapper, with bounded concurrency and stable result order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const run = createLimiter(limit);
  return Promise.allSettled(items.map((item, index) => run(() => mapper(item, index))));
}

/** Rejected results are logged by callers; this extracts only the successful values. */
export function fulfilled<T>(results: PromiseSettledResult<T>[]): T[] {
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}
