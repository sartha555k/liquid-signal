// One shared limit for route validation and public-demo validation.
export const MAX_ANALYSIS_BATCH_SIZE = 100;
export const ANALYSIS_WORKERS_PER_REQUEST = 10;

/**
 * Network-bound classifications use async workers, not CPU threads.
 * Preserve input order and drain in-flight work before reporting failures so
 * completed results can be cached and reused when the client retries.
 * @template T, R
 * @param {T[]} items
 * @param {(item: T) => Promise<R>} classify
 * @param {AbortSignal} signal
 */
export async function runDecisionWorkers(items, classify, signal) {
  /** @type {(R | undefined)[]} */
  const ordered = new Array(items.length);
  /** @type {Error[]} */
  const failures = [];
  let cursor = 0;

  async function worker() {
    while (!signal.aborted) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        ordered[index] = await classify(items[index]);
      } catch (error) {
        failures.push(error instanceof Error ? error : new Error('Decision classification failed'));
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(ANALYSIS_WORKERS_PER_REQUEST, items.length) }, worker,
  ));
  // Never return HTTP 200 with unclassified items after a cancellation.
  if (signal.aborted) throw signal.reason ?? new DOMException('Analysis request cancelled', 'AbortError');
  return { results: ordered.filter(result => result !== undefined), failures };
}
