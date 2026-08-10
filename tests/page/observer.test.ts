// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { observeMutations } from '../../src/page/observer';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mutate(root: HTMLElement): void {
  root.appendChild(document.createElement('span'));
}

describe('observeMutations', () => {
  it('calls onMutations after the debounce delay following a DOM change', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onMutations = vi.fn();
    const watcher = observeMutations(root, onMutations, 20);

    mutate(root);
    await wait(60);

    expect(onMutations).toHaveBeenCalledTimes(1);
    watcher.disconnect();
  });

  it('coalesces several rapid mutations into a single call', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onMutations = vi.fn();
    const watcher = observeMutations(root, onMutations, 30);

    mutate(root);
    await wait(10);
    mutate(root);
    await wait(10);
    mutate(root);
    await wait(60);

    expect(onMutations).toHaveBeenCalledTimes(1);
    watcher.disconnect();
  });

  it('does not call onMutations for mutations made while paused', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onMutations = vi.fn();
    const watcher = observeMutations(root, onMutations, 20);

    watcher.pause();
    mutate(root);
    await wait(60);

    expect(onMutations).not.toHaveBeenCalled();
    watcher.disconnect();
  });

  it('resumes observing after resume()', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onMutations = vi.fn();
    const watcher = observeMutations(root, onMutations, 20);

    watcher.pause();
    watcher.resume();
    mutate(root);
    await wait(60);

    expect(onMutations).toHaveBeenCalledTimes(1);
    watcher.disconnect();
  });

  it('stops calling onMutations after disconnect', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onMutations = vi.fn();
    const watcher = observeMutations(root, onMutations, 20);

    watcher.disconnect();
    mutate(root);
    await wait(60);

    expect(onMutations).not.toHaveBeenCalled();
  });

  it('cancels a pending debounced call when disconnected mid-wait', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onMutations = vi.fn();
    const watcher = observeMutations(root, onMutations, 30);

    mutate(root);
    await wait(5);
    watcher.disconnect();
    await wait(60);

    expect(onMutations).not.toHaveBeenCalled();
  });
});
