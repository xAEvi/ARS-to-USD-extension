/** Handle returned by `observeMutations`. */
export type MutationWatcher = {
  /** Stops observing and discards any pending debounced callback. */
  disconnect(): void;

  /**
   * Temporarily stops observing and discards any pending debounced
   * callback, so the extension's own DOM writes don't trigger a feedback
   * loop through this watcher.
   */
  pause(): void;

  /** Resumes observing after `pause()`. */
  resume(): void;
};

const OBSERVER_OPTIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
};

/**
 * Watches `root` for DOM mutations and calls `onMutations` after `debounceMs`
 * of quiet, so a burst of changes (a single SPA re-render) collapses into one
 * call. Per DISENO.md section 5.4, `pause()`/`resume()` are built on
 * `disconnect()`/`observe()` rather than a "suspended" flag: `disconnect()`
 * also discards any mutation records already queued, which is what actually
 * keeps the extension's own writes from re-triggering itself.
 *
 * @param {Node} root The subtree to watch.
 * @param {() => void} onMutations Called once, after the debounce window, when `root` has changed.
 * @param {number} [debounceMs] Quiet period before `onMutations` fires. Defaults to 500ms.
 * @returns {MutationWatcher} A handle to pause, resume or stop the watcher.
 */
export function observeMutations(
  root: Node,
  onMutations: () => void,
  debounceMs = 500,
): MutationWatcher {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function clearPending(): void {
    if (debounceTimer === undefined) return;
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }

  const observer = new MutationObserver(() => {
    clearPending();
    debounceTimer = setTimeout(onMutations, debounceMs);
  });

  observer.observe(root, OBSERVER_OPTIONS);

  return {
    disconnect(): void {
      clearPending();
      observer.disconnect();
    },
    pause(): void {
      clearPending();
      observer.disconnect();
    },
    resume(): void {
      observer.observe(root, OBSERVER_OPTIONS);
    },
  };
}
