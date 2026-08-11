/** Content shown in the floating panel: a resolved conversion, or a rate error. */
export type PanelContent =
  | {
      status: 'ok';
      rawText: string;
      converted: string;
      sourceLabel: string;
      ageLabel: string;
      isStale: boolean;
    }
  | { status: 'error'; rawText: string; message: string };

const PANEL_MARGIN = 8;

let hostEl: HTMLElement | undefined;
let panelEl: HTMLDivElement | undefined;
let onCloseRef: (() => void) | undefined;
let getAnchorRectRef: (() => DOMRect | undefined) | undefined;

const PANEL_STYLES = `
  .panel {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 2147483647;
    min-width: 160px;
    max-width: 260px;
    padding: 8px 10px;
    border-radius: 8px;
    background: #1c1c1c;
    color: #f5f5f5;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 13px;
    line-height: 1.4;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .original {
    color: #b3b3b3;
    font-size: 11px;
    text-decoration: underline dotted;
  }

  .converted {
    font-weight: 600;
    font-size: 15px;
    margin-top: 2px;
  }

  .meta {
    margin-top: 4px;
    font-size: 11px;
    color: #b3b3b3;
  }

  .meta.stale {
    color: #f2b84b;
  }

  .error {
    margin-top: 2px;
    color: #f28b82;
  }
`;

function ensurePanel(): HTMLDivElement {
  if (panelEl) return panelEl;

  hostEl = document.createElement('div');
  // Resets any styling the host page applies via a universal selector, so
  // the shadow boundary is the only thing that decides how the panel looks.
  hostEl.style.all = 'initial';
  document.body.appendChild(hostEl);

  const shadowRoot = hostEl.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = PANEL_STYLES;
  shadowRoot.appendChild(styleEl);

  panelEl = document.createElement('div');
  panelEl.className = 'panel';
  panelEl.hidden = true;
  shadowRoot.appendChild(panelEl);

  return panelEl;
}

function buildContent(content: PanelContent): Array<HTMLElement> {
  const originalEl = document.createElement('div');
  originalEl.className = 'original';
  originalEl.textContent = content.rawText;

  if (content.status === 'error') {
    const errorEl = document.createElement('div');
    errorEl.className = 'error';
    errorEl.textContent = content.message;
    return [originalEl, errorEl];
  }

  const convertedEl = document.createElement('div');
  convertedEl.className = 'converted';
  convertedEl.textContent = content.converted;

  const metaEl = document.createElement('div');
  metaEl.className = content.isStale ? 'meta stale' : 'meta';
  metaEl.textContent = content.isStale
    ? `Cotización vencida (${content.sourceLabel}, ${content.ageLabel})`
    : `Fuente: ${content.sourceLabel} · actualizado ${content.ageLabel}`;

  return [originalEl, convertedEl, metaEl];
}

function reposition(): void {
  const el = panelEl;
  if (!el) return;

  const rect = getAnchorRectRef?.();
  if (!rect) {
    closeAmountPanel();
    return;
  }

  const panelRect = el.getBoundingClientRect();

  let top = rect.bottom + PANEL_MARGIN;
  if (top + panelRect.height > window.innerHeight)
    top = rect.top - panelRect.height - PANEL_MARGIN;
  top = Math.max(PANEL_MARGIN, top);

  let left = rect.left;
  left = Math.min(left, window.innerWidth - panelRect.width - PANEL_MARGIN);
  left = Math.max(PANEL_MARGIN, left);

  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

function handleOutsideClick(event: MouseEvent): void {
  if (hostEl && !event.composedPath().includes(hostEl)) closeAmountPanel();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeAmountPanel();
}

/**
 * Shows the floating panel anchored to a selection, per DISENO.md section
 * 6.7's precedent of mounting page-injected UI in a Shadow DOM host attached
 * to `body`, so the host page's styles cannot deform it and the panel's own
 * styles cannot leak out.
 *
 * @param {() => DOMRect | undefined} getAnchorRect Recomputes the anchor's viewport-relative rect, called on every reposition; a `undefined` result closes the panel.
 * @param {PanelContent} content What to show.
 * @param {() => void} onClose Called when the panel closes, for any reason.
 */
export function showAmountPanel(
  getAnchorRect: () => DOMRect | undefined,
  content: PanelContent,
  onClose: () => void,
): void {
  const wasOpen = !!panelEl && !panelEl.hidden;
  const el = ensurePanel();

  el.replaceChildren(...buildContent(content));
  el.hidden = false;
  getAnchorRectRef = getAnchorRect;
  onCloseRef = onClose;

  reposition();

  if (!wasOpen) {
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('mousedown', handleOutsideClick, true);
    document.addEventListener('keydown', handleKeydown, true);
  }
}

/** Hides the floating panel and detaches its listeners, if it was open. */
export function closeAmountPanel(): void {
  if (!panelEl || panelEl.hidden) return;

  panelEl.hidden = true;
  window.removeEventListener('scroll', reposition, true);
  window.removeEventListener('resize', reposition);
  document.removeEventListener('mousedown', handleOutsideClick, true);
  document.removeEventListener('keydown', handleKeydown, true);

  getAnchorRectRef = undefined;
  const onClose = onCloseRef;
  onCloseRef = undefined;
  onClose?.();
}
