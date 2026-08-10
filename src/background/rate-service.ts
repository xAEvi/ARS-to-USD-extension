import { BLUELYTICS_URL, DOLARAPI_URL } from '../config/defaults';
import type { ArsToUsdConfiguration } from '../config/schema';
import type { ExchangeRate, RateSide } from '../core/types';
import { getStorageValue, setStorageValue } from '../shared/storage';

const RATE_CACHE_KEY = 'rate-cache';

/** Manual rates above this are rejected as likely typos; no real quote gets close. */
const MAX_MANUAL_RATE = 1_000_000;

type RateConfig = Pick<
  ArsToUsdConfiguration,
  'rateSource' | 'manualRate' | 'rateSide' | 'rateTtlMs'
>;

/** The raw compra/venta quote as cached, before resolving to a configured side. */
type CachedQuote = {
  compra: number;
  venta: number;
  provider: 'dolarapi' | 'bluelytics';
  fetchedAt: number;
  quotedAt: string;
};

export type RateResult =
  { status: 'ok'; rate: ExchangeRate } | { status: 'error'; message: string };

/**
 * Validates a manually entered exchange rate: positive, finite, and below a
 * generous upper bound that only rejects obvious typos.
 *
 * @param {number} value The candidate manual rate.
 * @returns {boolean} Whether the value can be used as a manual rate.
 */
export function isValidManualRate(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_MANUAL_RATE;
}

function resolveSide(
  quote: Pick<CachedQuote, 'compra' | 'venta'>,
  side: RateSide,
): number {
  if (side === 'compra') return quote.compra;
  if (side === 'venta') return quote.venta;
  return (quote.compra + quote.venta) / 2;
}

function toExchangeRate(
  quote: CachedQuote,
  side: RateSide,
  isStale: boolean,
): ExchangeRate {
  return {
    value: resolveSide(quote, side),
    side,
    provider: quote.provider,
    fetchedAt: quote.fetchedAt,
    quotedAt: quote.quotedAt,
    isStale,
  };
}

function manualExchangeRate(manualRate: number): ExchangeRate {
  return {
    value: manualRate,
    side: 'manual',
    provider: 'manual',
    fetchedAt: Date.now(),
    isStale: false,
  };
}

function manualRateResult(manualRate: number): RateResult {
  if (!isValidManualRate(manualRate))
    return {
      status: 'error',
      message: 'The manual exchange rate is not valid.',
    };

  return { status: 'ok', rate: manualExchangeRate(manualRate) };
}

async function fetchFromDolarApi(): Promise<CachedQuote> {
  const response = await fetch(DOLARAPI_URL);
  if (!response.ok)
    throw new Error(`dolarapi responded with status ${response.status}`);

  const body = (await response.json()) as {
    compra: number;
    venta: number;
    fechaActualizacion: string;
  };

  return {
    compra: body.compra,
    venta: body.venta,
    provider: 'dolarapi',
    fetchedAt: Date.now(),
    quotedAt: body.fechaActualizacion,
  };
}

// Bluelytics also reports both sides of the quote, so it is mapped the same
// way as the primary source instead of only ever serving `venta`.
async function fetchFromBluelytics(): Promise<CachedQuote> {
  const response = await fetch(BLUELYTICS_URL);
  if (!response.ok)
    throw new Error(`bluelytics responded with status ${response.status}`);

  const body = (await response.json()) as {
    oficial: { value_buy: number; value_sell: number; date?: string };
  };

  return {
    compra: body.oficial.value_buy,
    venta: body.oficial.value_sell,
    provider: 'bluelytics',
    fetchedAt: Date.now(),
    quotedAt: body.oficial.date ?? new Date().toISOString(),
  };
}

async function fetchQuote(): Promise<CachedQuote> {
  try {
    return await fetchFromDolarApi();
  } catch {
    return await fetchFromBluelytics();
  }
}

/**
 * Resolves the current exchange rate. Serves the cached quote when it is
 * still within its TTL, refreshes it otherwise, and never touches the
 * network when the source is manual.
 *
 * @param {RateConfig} config The rate-related configuration fields.
 * @returns {Promise<RateResult>} The resolved rate, or an error if none is available.
 */
export async function getRate(config: RateConfig): Promise<RateResult> {
  if (config.rateSource === 'manual')
    return manualRateResult(config.manualRate);

  const cached = await getStorageValue<CachedQuote>(RATE_CACHE_KEY);

  if (cached && Date.now() - cached.fetchedAt < config.rateTtlMs)
    return {
      status: 'ok',
      rate: toExchangeRate(cached, config.rateSide, false),
    };

  return refreshRate(config);
}

/**
 * Forces a fetch of the official rate, ignoring cache freshness. Falls back
 * to the primary source's counterpart on failure, then to an expired cached
 * value marked as stale, and only reports an error when neither is
 * available. No value is ever invented.
 *
 * @param {RateConfig} config The rate-related configuration fields.
 * @returns {Promise<RateResult>} The resolved rate, or an error if none is available.
 */
export async function refreshRate(config: RateConfig): Promise<RateResult> {
  if (config.rateSource === 'manual')
    return manualRateResult(config.manualRate);

  try {
    const quote = await fetchQuote();
    await setStorageValue(RATE_CACHE_KEY, quote);
    return {
      status: 'ok',
      rate: toExchangeRate(quote, config.rateSide, false),
    };
  } catch (error) {
    const cached = await getStorageValue<CachedQuote>(RATE_CACHE_KEY);
    if (cached)
      return {
        status: 'ok',
        rate: toExchangeRate(cached, config.rateSide, true),
      };

    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `Could not obtain the exchange rate: ${message}`,
    };
  }
}
