import type { Confidence, ExchangeRate } from '../core/types';

/**
 * Result of a scan, returned in response to `SCAN_RUN`. `suppressed` stays
 * at 0 until Fase 5 adds suppression rules.
 */
export type ScanSummary = {
  totalAnnotated: number;
  byConfidence: Record<Confidence, number>;
  suppressed: number;
};

/**
 * Typed message contracts exchanged between the popup, background and
 * content script. Trimmed to what this phase handles: `RULES_*` and the
 * `rules` field on `SCAN_RUN` from DISENO.md section 9 depend on
 * `SuppressionRule`, added in Fase 5.
 */
export type Message =
  | { type: 'RATE_GET' }
  | { type: 'RATE_REFRESH' }
  | { type: 'SCAN_RUN'; rate: ExchangeRate; minConfidence: Confidence }
  | { type: 'SCAN_REVERT' };
