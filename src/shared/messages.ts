import type { Confidence, ExchangeRate } from '../core/types';
import type { SuppressionRule } from '../core/suppression';

/** Result of a scan, returned in response to `SCAN_RUN`. */
export type ScanSummary = {
  totalAnnotated: number;
  byConfidence: Record<Confidence, number>;
  suppressed: number;
};

/**
 * Typed message contracts exchanged between the popup, background and
 * content script. `RULES_REMOVE` and `RULES_CLEAR` from DISENO.md section 9
 * are added in Fase 6, together with the popup UI that sends them.
 */
export type Message =
  | { type: 'RATE_GET' }
  | { type: 'RATE_REFRESH' }
  | { type: 'RULES_GET'; hostname: string }
  | { type: 'RULES_ADD'; rule: SuppressionRule }
  | {
      type: 'SCAN_RUN';
      rate: ExchangeRate;
      minConfidence: Confidence;
      rules: Array<SuppressionRule>;
    }
  | { type: 'SCAN_REVERT' };
