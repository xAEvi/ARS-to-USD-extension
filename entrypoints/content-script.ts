/**
 * Selection reading and the floating panel are not wired up yet -- this
 * entrypoint only exists so the popup has a real script to inject when the
 * user activates the extension on a tab.
 */
export default defineUnlistedScript(() => {
  const injectedWindow = window as typeof window & {
    __aruContentScriptLoaded?: boolean;
  };
  if (injectedWindow.__aruContentScriptLoaded) return;
  injectedWindow.__aruContentScriptLoaded = true;
});
