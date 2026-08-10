import { type NumberFormat, parseAmount } from './number-parser';
import { classifyMarker, type MarkerKind, TOKEN_PATTERN } from './patterns';
import type { Confidence, DetectedAmount, PageContext } from './types';

/**
 * Scores the confidence that a matched token is genuinely expressed in
 * Argentine pesos, per DISENO.md section 3.4. Returns `null` when the token
 * must be rejected outright.
 */
function scoreConfidence(
  prefixKind: MarkerKind,
  suffixKind: MarkerKind,
  value: number,
  format: NumberFormat,
  context: PageContext,
): Confidence | null {
  const hasExplicitArsMarker =
    prefixKind === 'ars-explicit' || suffixKind === 'ars-explicit';

  if (hasExplicitArsMarker || context.declaredArsPrices.has(value))
    return 'high';

  if (context.hasForeignCurrencyMarkup) return null;

  const hasArgentineContext =
    context.isArgentineDomain || context.isArgentineLocale;

  if (hasArgentineContext && format !== 'en-US') return 'medium';

  return 'low';
}

/**
 * Detects monetary amounts expressed in Argentine pesos within a text node.
 * A number without an adjacent currency marker is never returned, and any
 * token carrying a dollar marker is rejected outright.
 *
 * @param {string} text The text to scan.
 * @param {PageContext} context Signals about the page the text belongs to.
 * @returns {Array<DetectedAmount>} The detected amounts, in order of appearance.
 */
export function detect(
  text: string,
  context: PageContext,
): Array<DetectedAmount> {
  const results: Array<DetectedAmount> = [];

  TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_PATTERN.exec(text))) {
    const { prefix, number, suffix } = match.groups as {
      prefix?: string;
      number: string;
      suffix?: string;
    };

    // A bare number without any currency marker is never converted.
    if (!prefix && !suffix) continue;

    const prefixKind = classifyMarker(prefix);
    const suffixKind = classifyMarker(suffix);

    if (prefixKind === 'dollar' || suffixKind === 'dollar') continue;

    const { value, format } = parseAmount(number);
    const confidence = scoreConfidence(
      prefixKind,
      suffixKind,
      value,
      format,
      context,
    );

    if (!confidence) continue;

    results.push({
      rawText: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      valueArs: value,
      confidence,
    });
  }

  return results;
}
