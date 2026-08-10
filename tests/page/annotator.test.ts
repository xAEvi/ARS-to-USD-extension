// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detect } from '../../src/core/detector';
import type { DetectedAmount, PageContext } from '../../src/core/types';
import {
  annotateMixedTextNode,
  annotateTextNode,
  convertSuppressedWrap,
  injectAnnotationStyles,
  revert,
  revertWrap,
  type SuppressedAmount,
} from '../../src/page/annotator';
import { collectTextNodes } from '../../src/page/walker';

function context(overrides: Partial<PageContext> = {}): PageContext {
  return {
    hostname: 'example.com.ar',
    isArgentineDomain: true,
    isArgentineLocale: false,
    declaredArsPrices: new Set<number>(),
    hasForeignCurrencyMarkup: false,
    ...overrides,
  };
}

function formatAmount(amount: DetectedAmount): string {
  return `USD ${(amount.valueArs / 1000).toFixed(2)}`;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('annotateTextNode', () => {
  it('wraps a single match with the DISENO.md structure', () => {
    document.body.innerHTML = '<p>Precio: $1.500</p>';
    const paragraph = document.querySelector('p')!;
    const [textNode] = collectTextNodes(paragraph);
    const matches = detect(textNode!.textContent!, context());

    annotateTextNode(textNode!, matches, formatAmount);

    const wrap = paragraph.querySelector('[data-aru-wrap]')!;
    expect(wrap).not.toBeNull();
    expect(wrap.getAttribute('data-aru-original')).toBe('$1.500');
    expect(wrap.getAttribute('data-aru-confidence')).toBe('medium');
    expect(wrap.textContent).toBe('$1.500 (USD 1.50)');
    expect(paragraph.textContent).toBe('Precio: $1.500 (USD 1.50)');

    const usdSpan = wrap.querySelector('[data-aru-usd]')!;
    expect(usdSpan.textContent).toBe(' (USD 1.50)');
  });

  it('wraps multiple matches in the same text node correctly', () => {
    document.body.innerHTML = '<p>Antes $2.000, ahora $1.500.</p>';
    const paragraph = document.querySelector('p')!;
    const [textNode] = collectTextNodes(paragraph);
    const matches = detect(textNode!.textContent!, context());

    expect(matches).toHaveLength(2);
    annotateTextNode(textNode!, matches, formatAmount);

    const wraps = paragraph.querySelectorAll('[data-aru-wrap]');
    expect(wraps).toHaveLength(2);
    expect(wraps[0]!.getAttribute('data-aru-original')).toBe('$2.000');
    expect(wraps[1]!.getAttribute('data-aru-original')).toBe('$1.500');
    expect(paragraph.textContent).toBe(
      'Antes $2.000 (USD 2.00), ahora $1.500 (USD 1.50).',
    );
  });

  it('sets a title on low confidence amounts and not on others', () => {
    document.body.innerHTML = '<p>Total: $15.000</p>';
    const paragraph = document.querySelector('p')!;
    const [textNode] = collectTextNodes(paragraph);
    // Non-Argentine context downgrades the ambiguous $ to low confidence.
    const matches = detect(
      textNode!.textContent!,
      context({ isArgentineDomain: false }),
    );

    annotateTextNode(textNode!, matches, formatAmount);

    const wrap = paragraph.querySelector('[data-aru-wrap]')!;
    expect(wrap.getAttribute('data-aru-confidence')).toBe('low');
    expect(wrap.getAttribute('title')).toContain('baja confianza');
  });

  it('calls onFeedbackRequested with preventDefault/stopPropagation applied when the usd span is clicked', () => {
    document.body.innerHTML = '<a href="/product"><p>Precio: $1.500</p></a>';
    const paragraph = document.querySelector('p')!;
    const link = document.querySelector('a')!;
    const [textNode] = collectTextNodes(paragraph);
    const matches = detect(textNode!.textContent!, context());
    const onFeedbackRequested = vi.fn();

    annotateTextNode(textNode!, matches, formatAmount, onFeedbackRequested);

    const wrap = paragraph.querySelector('[data-aru-wrap]')!;
    const usdSpan = wrap.querySelector<HTMLElement>('[data-aru-usd]')!;
    const navigationListener = vi.fn();
    link.addEventListener('click', navigationListener);

    usdSpan.click();

    expect(onFeedbackRequested).toHaveBeenCalledWith(wrap, matches[0]);
    // stopPropagation means the click never bubbles up to the surrounding <a>.
    expect(navigationListener).not.toHaveBeenCalled();
  });

  it('does not attach a click listener when onFeedbackRequested is not provided', () => {
    document.body.innerHTML = '<p>Precio: $1.500</p>';
    const paragraph = document.querySelector('p')!;
    const [textNode] = collectTextNodes(paragraph);
    const matches = detect(textNode!.textContent!, context());

    annotateTextNode(textNode!, matches, formatAmount);

    const usdSpan = paragraph.querySelector<HTMLElement>('[data-aru-usd]')!;
    expect(() => usdSpan.click()).not.toThrow();
  });
});

describe('revert', () => {
  it('restores the original text and normalizes adjacent text nodes', () => {
    document.body.innerHTML = '<p>Antes $2.000, ahora $1.500.</p>';
    const paragraph = document.querySelector('p')!;
    const [textNode] = collectTextNodes(paragraph);
    const matches = detect(textNode!.textContent!, context());
    annotateTextNode(textNode!, matches, formatAmount);

    revert(paragraph);

    expect(paragraph.querySelectorAll('[data-aru-wrap]')).toHaveLength(0);
    expect(paragraph.textContent).toBe('Antes $2.000, ahora $1.500.');
    expect(paragraph.childNodes).toHaveLength(1);
  });
});

describe('revertWrap', () => {
  it('reverts only the targeted wrap, leaving the others intact', () => {
    document.body.innerHTML = '<p>Antes $2.000, ahora $1.500.</p>';
    const paragraph = document.querySelector('p')!;
    const [textNode] = collectTextNodes(paragraph);
    const matches = detect(textNode!.textContent!, context());
    annotateTextNode(textNode!, matches, formatAmount);

    const wraps = paragraph.querySelectorAll('[data-aru-wrap]');
    revertWrap(wraps[0]!);

    expect(paragraph.querySelectorAll('[data-aru-wrap]')).toHaveLength(1);
    expect(paragraph.textContent).toBe(
      'Antes $2.000, ahora $1.500 (USD 1.50).',
    );
  });
});

describe('walker and annotator combined idempotency', () => {
  it('does not re-collect text already annotated on a second scan', () => {
    document.body.innerHTML = '<p>$1.500</p>';
    const paragraph = document.querySelector('p')!;

    const firstScanNodes = collectTextNodes(paragraph);
    for (const textNode of firstScanNodes) {
      const matches = detect(textNode.textContent!, context());
      annotateTextNode(textNode, matches, formatAmount);
    }

    const secondScanNodes = collectTextNodes(paragraph);

    expect(secondScanNodes).toHaveLength(0);
  });
});

function suppress(amount: DetectedAmount, overrides = {}): SuppressedAmount {
  return {
    ...amount,
    ruleIds: ['example.com:location:.price'],
    reason: 'not-a-price',
    ...overrides,
  };
}

describe('annotateMixedTextNode', () => {
  it('renders a suppressed-only match with a marker instead of a usd span', () => {
    document.body.innerHTML = '<p>Precio: $1.500</p>';
    const paragraph = document.querySelector('p')!;
    const [textNode] = collectTextNodes(paragraph);
    const matches = detect(textNode!.textContent!, context());

    annotateMixedTextNode(textNode!, [], [suppress(matches[0]!)], formatAmount);

    const wrap = paragraph.querySelector('[data-aru-wrap]')!;
    expect(wrap.getAttribute('data-aru-original')).toBe('$1.500');
    expect(wrap.hasAttribute('data-aru-suppressed')).toBe(true);
    expect(wrap.getAttribute('data-aru-suppression-reason')).toBe(
      'not-a-price',
    );
    expect(wrap.querySelector('[data-aru-usd]')).toBeNull();
    expect(wrap.querySelector('[data-aru-suppressed-marker]')).not.toBeNull();
  });

  it('mixes a converted and a suppressed match in the same text node', () => {
    document.body.innerHTML = '<p>Antes $2.000, ahora $1.500.</p>';
    const paragraph = document.querySelector('p')!;
    const [textNode] = collectTextNodes(paragraph);
    const matches = detect(textNode!.textContent!, context());

    annotateMixedTextNode(
      textNode!,
      [matches[0]!],
      [suppress(matches[1]!)],
      formatAmount,
    );

    const wraps = paragraph.querySelectorAll('[data-aru-wrap]');
    expect(wraps).toHaveLength(2);
    expect(wraps[0]!.querySelector('[data-aru-usd]')).not.toBeNull();
    expect(wraps[0]!.hasAttribute('data-aru-suppressed')).toBe(false);
    expect(wraps[1]!.hasAttribute('data-aru-suppressed')).toBe(true);
    expect(wraps[1]!.querySelector('[data-aru-usd]')).toBeNull();
    expect(paragraph.textContent).toBe(
      'Antes $2.000 (USD 2.00), ahora $1.500⊘.',
    );
  });

  it('calls onUnsuppressRequested with preventDefault/stopPropagation applied when the marker is clicked', () => {
    document.body.innerHTML = '<a href="/product"><p>Precio: $1.500</p></a>';
    const paragraph = document.querySelector('p')!;
    const link = document.querySelector('a')!;
    const [textNode] = collectTextNodes(paragraph);
    const matches = detect(textNode!.textContent!, context());
    const onUnsuppressRequested = vi.fn();
    const entry = suppress(matches[0]!);

    annotateMixedTextNode(
      textNode!,
      [],
      [entry],
      formatAmount,
      undefined,
      onUnsuppressRequested,
    );

    const wrap = paragraph.querySelector('[data-aru-wrap]')!;
    const marker = wrap.querySelector<HTMLElement>(
      '[data-aru-suppressed-marker]',
    )!;
    const navigationListener = vi.fn();
    link.addEventListener('click', navigationListener);

    marker.click();

    expect(onUnsuppressRequested).toHaveBeenCalledWith(wrap, entry);
    expect(navigationListener).not.toHaveBeenCalled();
  });

  it('does not attach a click listener when onUnsuppressRequested is not provided', () => {
    document.body.innerHTML = '<p>Precio: $1.500</p>';
    const paragraph = document.querySelector('p')!;
    const [textNode] = collectTextNodes(paragraph);
    const matches = detect(textNode!.textContent!, context());

    annotateMixedTextNode(textNode!, [], [suppress(matches[0]!)], formatAmount);

    const marker = paragraph.querySelector<HTMLElement>(
      '[data-aru-suppressed-marker]',
    )!;
    expect(() => marker.click()).not.toThrow();
  });
});

describe('convertSuppressedWrap', () => {
  it('turns a suppressed wrap into a converted one in place', () => {
    document.body.innerHTML = '<p>Precio: $1.500</p>';
    const paragraph = document.querySelector('p')!;
    const [textNode] = collectTextNodes(paragraph);
    const matches = detect(textNode!.textContent!, context());
    const onFeedbackRequested = vi.fn();

    annotateMixedTextNode(textNode!, [], [suppress(matches[0]!)], formatAmount);
    const wrap = paragraph.querySelector<HTMLElement>('[data-aru-wrap]')!;

    convertSuppressedWrap(wrap, matches[0]!, formatAmount, onFeedbackRequested);

    expect(wrap.hasAttribute('data-aru-suppressed')).toBe(false);
    expect(wrap.hasAttribute('data-aru-suppression-reason')).toBe(false);
    expect(wrap.querySelector('[data-aru-suppressed-marker]')).toBeNull();
    const usdSpan = wrap.querySelector<HTMLElement>('[data-aru-usd]')!;
    expect(usdSpan.textContent).toBe(' (USD 1.50)');

    usdSpan.click();
    expect(onFeedbackRequested).toHaveBeenCalledWith(wrap, matches[0]);
  });
});

describe('injectAnnotationStyles', () => {
  it('injects the stylesheet once and is idempotent on repeated calls', () => {
    injectAnnotationStyles(document);
    injectAnnotationStyles(document);

    expect(document.querySelectorAll('#aru-styles')).toHaveLength(1);
  });
});
