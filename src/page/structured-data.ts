import type { PageContext } from '../core/types';

type StructuredDataSignals = Pick<
  PageContext,
  'declaredArsPrices' | 'hasForeignCurrencyMarkup'
>;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Recursively walks a parsed JSON-LD value looking for schema.org price
 * declarations: any object pairing a `priceCurrency` string with a numeric
 * `price`, `lowPrice` or `highPrice` (the shapes of `Offer` and
 * `AggregateOffer`). Walking every object and array generically, instead of
 * gating on `@type` being exactly `Product`/`Offer`/`AggregateOffer`, also
 * covers `@graph` wrappers and nested `offers` for free: real-world JSON-LD
 * is inconsistent about declaring `@type`, while `priceCurrency` paired with
 * a price field is already a specific enough signal on its own.
 *
 * @param {unknown} value The JSON-LD value (or subtree) to walk.
 * @param {StructuredDataSignals} signals Mutated in place as declarations are found.
 */
function collectPriceDeclarations(
  value: unknown,
  signals: StructuredDataSignals,
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPriceDeclarations(item, signals);
    return;
  }

  if (value === null || typeof value !== 'object') return;

  const node = value as Record<string, unknown>;

  if (typeof node.priceCurrency === 'string') {
    const prices = [node.price, node.lowPrice, node.highPrice]
      .map(toFiniteNumber)
      .filter((price): price is number => price !== null);

    if (prices.length > 0) {
      if (node.priceCurrency.toUpperCase() === 'ARS') {
        for (const price of prices) signals.declaredArsPrices.add(price);
      } else {
        signals.hasForeignCurrencyMarkup = true;
      }
    }
  }

  for (const key of Object.keys(node))
    collectPriceDeclarations(node[key], signals);
}

/**
 * Reads every `script[type="application/ld+json"]` in the document and
 * extracts schema.org price declarations, per DISENO.md section 3.1.
 * Malformed JSON is skipped rather than thrown, since this markup is
 * third-party content outside the extension's control.
 *
 * @param {Document} doc The document to read JSON-LD from.
 * @returns {StructuredDataSignals} The signals to merge into a `PageContext`.
 */
export function readStructuredData(doc: Document): StructuredDataSignals {
  const signals: StructuredDataSignals = {
    declaredArsPrices: new Set(),
    hasForeignCurrencyMarkup: false,
  };

  for (const script of doc.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      collectPriceDeclarations(JSON.parse(script.textContent ?? ''), signals);
    } catch {
      // Malformed JSON-LD is common in the wild; skip and keep scanning.
    }
  }

  return signals;
}
