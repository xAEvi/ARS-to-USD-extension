// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeAmountPanel,
  showAmountPanel,
  type PanelContent,
} from '../../src/page/panel';

const anchorRect = {
  top: 100,
  bottom: 120,
  left: 50,
  right: 150,
  width: 100,
  height: 20,
} as DOMRect;

function okContent(overrides: Partial<Extract<PanelContent, { status: 'ok' }>> = {}): PanelContent {
  return {
    status: 'ok',
    rawText: '$15.000',
    converted: 'USD 12,50',
    sourceLabel: 'dolarapi.com',
    ageLabel: 'hace 3 minutos',
    isStale: false,
    ...overrides,
  };
}

/**
 * The panel mounts a single Shadow DOM host once and reuses it, per its own
 * design, so the tests do the same instead of clearing `document.body`
 * between cases, which would detach the host without the module knowing.
 */
function panelEl(): HTMLDivElement {
  return document.body.lastElementChild!.shadowRoot!.querySelector(
    '.panel',
  ) as HTMLDivElement;
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 200,
    height: 60,
  } as DOMRect);
});

afterEach(() => {
  closeAmountPanel();
  vi.restoreAllMocks();
});

describe('showAmountPanel', () => {
  it('renders the converted amount and rate meta', () => {
    showAmountPanel(() => anchorRect, okContent(), () => {});

    expect(panelEl().hidden).toBe(false);
    expect(panelEl().textContent).toContain('$15.000');
    expect(panelEl().textContent).toContain('USD 12,50');
    expect(panelEl().textContent).toContain('dolarapi.com');
  });

  it('marks a stale rate visibly', () => {
    showAmountPanel(() => anchorRect, okContent({ isStale: true }), () => {});

    expect(panelEl().querySelector('.meta.stale')).not.toBeNull();
    expect(panelEl().textContent).toContain('Cotización vencida');
  });

  it('renders an error state instead of a conversion', () => {
    showAmountPanel(
      () => anchorRect,
      {
        status: 'error',
        rawText: '$15.000',
        message: 'No se pudo obtener la cotización.',
      },
      () => {},
    );

    expect(panelEl().querySelector('.converted')).toBeNull();
    expect(panelEl().textContent).toContain(
      'No se pudo obtener la cotización.',
    );
  });

  it('positions the panel below and aligned to the anchor rect', () => {
    showAmountPanel(() => anchorRect, okContent(), () => {});

    expect(panelEl().style.top).toBe(`${anchorRect.bottom + 8}px`);
    expect(panelEl().style.left).toBe(`${anchorRect.left}px`);
  });

  it('closes itself when the anchor rect disappears on scroll', () => {
    let rect: DOMRect | undefined = anchorRect;
    showAmountPanel(() => rect, okContent(), () => {});

    rect = undefined;
    window.dispatchEvent(new Event('scroll'));

    expect(panelEl().hidden).toBe(true);
  });
});

describe('closeAmountPanel', () => {
  it('hides the panel and calls onClose', () => {
    const onClose = vi.fn();
    showAmountPanel(() => anchorRect, okContent(), onClose);

    closeAmountPanel();

    expect(panelEl().hidden).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('is a no-op when nothing is open', () => {
    expect(() => closeAmountPanel()).not.toThrow();
  });
});

describe('dismissal', () => {
  it('closes on Escape', () => {
    showAmountPanel(() => anchorRect, okContent(), () => {});

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(panelEl().hidden).toBe(true);
  });

  it('closes on a click outside the panel', () => {
    showAmountPanel(() => anchorRect, okContent(), () => {});

    document.body.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, composed: true }),
    );

    expect(panelEl().hidden).toBe(true);
  });

  it('does not close on a click inside the panel', () => {
    showAmountPanel(() => anchorRect, okContent(), () => {});

    panelEl().dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, composed: true }),
    );

    expect(panelEl().hidden).toBe(false);
  });
});
