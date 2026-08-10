import type { PageContext } from '../core/types';

const ARGENTINE_TLD_PATTERN = /\.ar$/i;
const ARGENTINE_LOCALE_PATTERN = /^es[-_]ar$/i;

function readOgLocale(doc: Document): string | undefined {
  return (
    doc.querySelector('meta[property="og:locale"]')?.getAttribute('content') ??
    undefined
  );
}

/**
 * Builds the `PageContext` for a document per DISENO.md section 3.1.
 * `declaredArsPrices` and `hasForeignCurrencyMarkup` stay at their neutral
 * defaults until Fase 7 adds JSON-LD parsing (`structured-data.ts`).
 *
 * @param {Document} doc The document to read signals from.
 * @param {string} [hostname] The hostname to use. Defaults to `doc.location.hostname`; overridable for tests.
 * @returns {PageContext} The context to pass to `detect`.
 */
export function buildPageContext(
  doc: Document,
  hostname: string = doc.location.hostname,
): PageContext {
  const documentLanguage = doc.documentElement.lang || undefined;
  const ogLocale = readOgLocale(doc);

  return {
    hostname,
    isArgentineDomain: ARGENTINE_TLD_PATTERN.test(hostname),
    documentLanguage,
    isArgentineLocale:
      ARGENTINE_LOCALE_PATTERN.test(documentLanguage ?? '') ||
      ARGENTINE_LOCALE_PATTERN.test(ogLocale ?? ''),
    declaredArsPrices: new Set(),
    hasForeignCurrencyMarkup: false,
  };
}
