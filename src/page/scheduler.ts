export type BatchOptions = {
  /** Max items processed per tick before yielding. Default 40. */
  batchSize?: number;

  /** Checked before every item; processing stops as soon as this returns false. */
  shouldContinue?: () => boolean;
};

function scheduleIdle(callback: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => callback());
  else setTimeout(callback, 0);
}

/**
 * Processes `items` in batches, yielding to the browser's idle time between
 * batches (`requestIdleCallback`, falling back to `setTimeout` where it
 * isn't available) so a page with thousands of matches doesn't block the
 * main thread in one long synchronous pass (DISENO.md section 5.4). The
 * first batch runs synchronously, before this function even returns; only
 * later batches are deferred, since a single small batch is cheap enough
 * not to need yielding.
 *
 * @param {Array<T>} items The items to process, in order.
 * @param {(item: T) => void} processItem Called once for each item that gets processed.
 * @param {BatchOptions} [options] Batch size and an optional early-stop predicate.
 * @returns {Promise<void>} Resolves once every item has been processed, or `shouldContinue` returned false.
 */
export function processInBatches<T>(
  items: Array<T>,
  processItem: (item: T) => void,
  options: BatchOptions = {},
): Promise<void> {
  const { batchSize = 40, shouldContinue = () => true } = options;

  return new Promise((resolve) => {
    let index = 0;

    function runBatch(): void {
      const end = Math.min(index + batchSize, items.length);
      for (; index < end && shouldContinue(); index++) processItem(items[index]!);

      if (index < items.length && shouldContinue()) scheduleIdle(runBatch);
      else resolve();
    }

    runBatch();
  });
}
