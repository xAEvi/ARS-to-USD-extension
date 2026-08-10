// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { detect } from '../../src/core/detector';
import type { DetectedAmount, PageContext } from '../../src/core/types';
import {
  annotateTextNode,
  injectAnnotationStyles,
  revert,
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

describe('injectAnnotationStyles', () => {
  it('injects the stylesheet once and is idempotent on repeated calls', () => {
    injectAnnotationStyles(document);
    injectAnnotationStyles(document);

    expect(document.querySelectorAll('#aru-styles')).toHaveLength(1);
  });
});
