// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { processInBatches } from '../../src/page/scheduler';

describe('processInBatches', () => {
  it('processes every item and resolves when under the batch size', async () => {
    const processed: Array<number> = [];

    await processInBatches([1, 2, 3], (item) => processed.push(item), {
      batchSize: 10,
    });

    expect(processed).toEqual([1, 2, 3]);
  });

  it('runs the first batch synchronously and defers the rest', async () => {
    const processed: Array<number> = [];
    const items = Array.from({ length: 25 }, (_, i) => i);

    const done = processInBatches(items, (item) => processed.push(item), {
      batchSize: 10,
    });

    // The first batch (10 items) has already run synchronously, before
    // this line, even though the promise hasn't resolved yet.
    expect(processed).toHaveLength(10);

    await done;

    expect(processed).toHaveLength(25);
    expect(processed).toEqual(items);
  });

  it('stops early once shouldContinue returns false, but still resolves', async () => {
    const processed: Array<number> = [];
    const items = Array.from({ length: 100 }, (_, i) => i);

    await processInBatches(items, (item) => processed.push(item), {
      batchSize: 10,
      shouldContinue: () => processed.length < 15,
    });

    expect(processed).toHaveLength(15);
  });
});
