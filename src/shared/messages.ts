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
 * content script. `RULES_TOUCH` is not in DISENO.md section 9's snippet, but
 * is required to make the LRU pruning in `suppression-store.ts` actually
 * order by usage (`lastMatchedAt`) instead of falling back to `createdAt`.
 */
export type Message =
  | { type: 'RATE_GET' }
  | { type: 'RATE_REFRESH' }
  | { type: 'RULES_GET'; hostname: string }
  | { type: 'RULES_ADD'; rule: SuppressionRule }
  | { type: 'RULES_REMOVE'; hostname: string; ruleId: string }
  | { type: 'RULES_CLEAR'; hostname: string }
  | { type: 'RULES_TOUCH'; hostname: string; ruleIds: Array<string> }
  | {
      type: 'SCAN_RUN';
      rate: ExchangeRate;
      minConfidence: Confidence;
      rules: Array<SuppressionRule>;
      showSuppressed: boolean;
    }
  | { type: 'SCAN_REVERT' };
