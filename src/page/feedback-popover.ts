import type { SuppressionReason, SuppressionScope } from '../core/suppression';

export type FeedbackChoice = {
  reason: SuppressionReason;
  scope: SuppressionScope;
};

const HOST_ELEMENT_ID = 'aru-feedback-popover-host';

const POPOVER_STYLES = `
  .popover {
    position: fixed;
    z-index: 2147483647;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    background: #fff;
    color: #1a1a1a;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 8px;
    min-width: 220px;
  }
  .popover p {
    margin: 0 0 6px;
    font-weight: 600;
  }
  .popover button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 8px;
    margin: 2px 0;
    border: none;
    border-radius: 4px;
    background: none;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  .popover button:hover {
    background: #f0f0f0;
  }
  .popover label {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    font-size: 12px;
  }
  .popover .cancel {
    color: #b3261e;
    margin-top: 4px;
  }
`;

let activeHost: HTMLElement | null = null;
let activeOutsideClickListener: ((event: MouseEvent) => void) | null = null;

/** Closes the currently open feedback popover, if any. Safe to call when none is open. */
export function closeFeedbackPopover(): void {
  if (activeOutsideClickListener) {
    document.removeEventListener('click', activeOutsideClickListener, true);
    activeOutsideClickListener = null;
  }

  activeHost?.remove();
  activeHost = null;
}

/**
 * Shows the false-alarm feedback popover anchored near `anchor`, per
 * DISENO.md section 6.7: mounted in a Shadow DOM host attached to `body` so
 * site styles cannot deform it and its own styles never leak out. Closes
 * any popover already open.
 *
 * @param {HTMLElement} anchor The element the popover is anchored to.
 * @param {(choice: FeedbackChoice) => void} onConfirm Called with the chosen reason and scope when the user confirms.
 */
export function showFeedbackPopover(
  anchor: HTMLElement,
  onConfirm: (choice: FeedbackChoice) => void,
): void {
  closeFeedbackPopover();

  const host = document.createElement('div');
  host.id = HOST_ELEMENT_ID;
  host.style.all = 'initial';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = POPOVER_STYLES;
  shadow.appendChild(style);

  const popover = document.createElement('div');
  popover.className = 'popover';

  const rect = anchor.getBoundingClientRect();
  popover.style.top = `${rect.bottom + 4}px`;
  popover.style.left = `${rect.left}px`;

  const title = document.createElement('p');
  title.textContent = '¿Este monto no debería haberse convertido?';
  popover.appendChild(title);

  let applyToSimilar = false;

  function confirmWith(reason: SuppressionReason): void {
    const scope: SuppressionScope = applyToSimilar
      ? 'location-group'
      : 'location';
    closeFeedbackPopover();
    onConfirm({ reason, scope });
  }

  const notAPriceButton = document.createElement('button');
  notAPriceButton.type = 'button';
  notAPriceButton.textContent = 'No es un precio';
  notAPriceButton.addEventListener('click', () => confirmWith('not-a-price'));
  popover.appendChild(notAPriceButton);

  const notArsButton = document.createElement('button');
  notArsButton.type = 'button';
  notArsButton.textContent = 'No está en pesos';
  notArsButton.addEventListener('click', () => confirmWith('not-ars'));
  popover.appendChild(notArsButton);

  const groupLabel = document.createElement('label');
  const groupCheckbox = document.createElement('input');
  groupCheckbox.type = 'checkbox';
  groupCheckbox.addEventListener('change', () => {
    applyToSimilar = groupCheckbox.checked;
  });
  groupLabel.appendChild(groupCheckbox);
  groupLabel.appendChild(
    document.createTextNode('Aplicar a todos los similares'),
  );
  popover.appendChild(groupLabel);

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'cancel';
  cancelButton.textContent = 'Cancelar';
  cancelButton.addEventListener('click', () => closeFeedbackPopover());
  popover.appendChild(cancelButton);

  shadow.appendChild(popover);
  document.body.appendChild(host);
  activeHost = host;

  // Deferred so the click that opened the popover does not immediately
  // close it again while it is still bubbling.
  const outsideClickListener = (event: MouseEvent): void => {
    if (event.composedPath().includes(host)) return;
    closeFeedbackPopover();
  };
  activeOutsideClickListener = outsideClickListener;
  setTimeout(() =>
    document.addEventListener('click', outsideClickListener, true),
  );
}
