import type { PageContext } from '../core/types';
import { readStructuredData } from './structured-data';

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
  const { declaredArsPrices, hasForeignCurrencyMarkup } =
    readStructuredData(doc);

  return {
    hostname,
    isArgentineDomain: ARGENTINE_TLD_PATTERN.test(hostname),
    documentLanguage,
    isArgentineLocale:
      ARGENTINE_LOCALE_PATTERN.test(documentLanguage ?? '') ||
      ARGENTINE_LOCALE_PATTERN.test(ogLocale ?? ''),
    declaredArsPrices,
    hasForeignCurrencyMarkup,
  };
}
