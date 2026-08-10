import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRate,
  isValidManualRate,
  refreshRate,
} from '../src/background/rate-service';
import type { ArsToUsdConfiguration } from '../src/config/schema';
import { resetFakeChromeStorage } from './setup/chrome-storage';

type RateConfig = Pick<
  ArsToUsdConfiguration,
  'rateSource' | 'manualRate' | 'rateSide' | 'rateTtlMs'
>;

function config(overrides: Partial<RateConfig> = {}): RateConfig {
  return {
    rateSource: 'official',
    manualRate: 1000,
    rateSide: 'venta',
    rateTtlMs: 10 * 60 * 1000,
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function failedResponse(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as Response;
}

beforeEach(() => {
  resetFakeChromeStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getRate / refreshRate', () => {
  it('fetches and caches the primary source', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        compra: 1000,
        venta: 1050,
        fechaActualizacion: '2026-08-10T12:00:00.000Z',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getRate(config());

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.rate.value).toBe(1050);
      expect(result.rate.provider).toBe('dolarapi');
      expect(result.rate.isStale).toBe(false);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to bluelytics when the primary source fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failedResponse(503))
      .mockResolvedValueOnce(
        jsonResponse({
          oficial: { value_buy: 990, value_sell: 1010, date: '2026-08-10' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshRate(config());

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.rate.value).toBe(1010);
      expect(result.rate.provider).toBe('bluelytics');
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves the compra and promedio sides from the same quote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          compra: 1000,
          venta: 1050,
          fechaActualizacion: '2026-08-10T12:00:00.000Z',
        }),
      ),
    );

    const compra = await refreshRate(config({ rateSide: 'compra' }));
    const promedio = await refreshRate(config({ rateSide: 'promedio' }));

    expect(compra.status === 'ok' && compra.rate.value).toBe(1000);
    expect(promedio.status === 'ok' && promedio.rate.value).toBe(1025);
  });

  it('reuses a fresh cached rate without calling fetch again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        compra: 1000,
        venta: 1050,
        fechaActualizacion: '2026-08-10T12:00:00.000Z',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getRate(config());
    const second = await getRate(config());

    expect(second.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the cached rate has expired', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        compra: 1000,
        venta: 1050,
        fechaActualizacion: '2026-08-10T12:00:00.000Z',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getRate(config({ rateTtlMs: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await getRate(config({ rateTtlMs: 1 }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves a stale cached rate when every source fails after a prior success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          compra: 1000,
          venta: 1050,
          fechaActualizacion: '2026-08-10T12:00:00.000Z',
        }),
      )
      .mockRejectedValue(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);

    await getRate(config({ rateTtlMs: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = await getRate(config({ rateTtlMs: 1 }));

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.rate.isStale).toBe(true);
  });

  it('reports an error when every source fails and there is no cache', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network error')),
    );

    const result = await getRate(config());

    expect(result.status).toBe('error');
  });

  it('never calls fetch in manual mode', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await getRate(
      config({ rateSource: 'manual', manualRate: 1200 }),
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.rate.value).toBe(1200);
      expect(result.rate.provider).toBe('manual');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid manual rate', async () => {
    const result = await getRate(
      config({ rateSource: 'manual', manualRate: 0 }),
    );
    expect(result.status).toBe('error');
  });
});

describe('isValidManualRate', () => {
  it.each([
    [0, false],
    [-10, false],
    [1000, true],
    [1_000_000, true],
    [1_000_001, false],
    [Number.NaN, false],
  ] as const)('%d -> %s', (value, expected) => {
    expect(isValidManualRate(value)).toBe(expected);
  });
});
