// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readStructuredData } from '../../src/page/structured-data';

function addJsonLd(json: unknown): void {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(json);
  document.head.appendChild(script);
}

function addRawJsonLd(text: string): void {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = text;
  document.head.appendChild(script);
}

beforeEach(() => {
  document.head.innerHTML = '';
});

describe('readStructuredData', () => {
  it('returns empty signals when there is no JSON-LD script', () => {
    const signals = readStructuredData(document);
    expect(signals.declaredArsPrices.size).toBe(0);
    expect(signals.hasForeignCurrencyMarkup).toBe(false);
  });

  it('collects the price from an Offer declared in ARS', () => {
    addJsonLd({
      '@type': 'Product',
      offers: { '@type': 'Offer', price: '15000', priceCurrency: 'ARS' },
    });

    const signals = readStructuredData(document);
    expect(signals.declaredArsPrices.has(15000)).toBe(true);
    expect(signals.hasForeignCurrencyMarkup).toBe(false);
  });

  it('collects both bounds of an AggregateOffer declared in ARS', () => {
    addJsonLd({
      '@type': 'AggregateOffer',
      lowPrice: 1000,
      highPrice: 2000,
      priceCurrency: 'ARS',
    });

    const signals = readStructuredData(document);
    expect(signals.declaredArsPrices.has(1000)).toBe(true);
    expect(signals.declaredArsPrices.has(2000)).toBe(true);
  });

  it('flags a foreign currency without adding to declaredArsPrices', () => {
    addJsonLd({ '@type': 'Offer', price: 12, priceCurrency: 'USD' });

    const signals = readStructuredData(document);
    expect(signals.declaredArsPrices.size).toBe(0);
    expect(signals.hasForeignCurrencyMarkup).toBe(true);
  });

  it('reads offers nested under an @graph wrapper', () => {
    addJsonLd({
      '@graph': [
        { '@type': 'WebPage' },
        {
          '@type': 'Product',
          offers: [
            { '@type': 'Offer', price: '500', priceCurrency: 'ars' },
            { '@type': 'Offer', price: '700', priceCurrency: 'ARS' },
          ],
        },
      ],
    });

    const signals = readStructuredData(document);
    expect([...signals.declaredArsPrices].sort()).toEqual([500, 700]);
  });

  it('skips a malformed script but still reads a valid one', () => {
    addRawJsonLd('{ not valid json');
    addJsonLd({ '@type': 'Offer', price: 999, priceCurrency: 'ARS' });

    const signals = readStructuredData(document);
    expect(signals.declaredArsPrices.has(999)).toBe(true);
  });

  it('ignores an object with priceCurrency but no numeric price field', () => {
    addJsonLd({ '@type': 'Offer', priceCurrency: 'ARS', price: '' });

    const signals = readStructuredData(document);
    expect(signals.declaredArsPrices.size).toBe(0);
    expect(signals.hasForeignCurrencyMarkup).toBe(false);
  });
});
