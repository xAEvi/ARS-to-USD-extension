import {
  isValidManualRate,
  type RateResult,
} from '../../src/background/rate-service';
import { getConfiguration, setConfiguration } from '../../src/config/store';
import {
  normalizeHostname,
  type SuppressionRule,
} from '../../src/core/suppression';
import type { RateProvider } from '../../src/core/types';
import type { Message, ScanSummary } from '../../src/shared/messages';

const rateValueEl =
  document.querySelector<HTMLParagraphElement>('#rate-value')!;
const rateMetaEl = document.querySelector<HTMLParagraphElement>('#rate-meta')!;
const rateSourceEl = document.querySelector<HTMLSelectElement>('#rate-source')!;
const manualRateFieldEl =
  document.querySelector<HTMLDivElement>('#manual-rate-field')!;
const manualRateEl = document.querySelector<HTMLInputElement>('#manual-rate')!;
const manualRateErrorEl =
  document.querySelector<HTMLParagraphElement>('#manual-rate-error')!;
const convertButtonEl = document.querySelector<HTMLButtonElement>('#convert')!;
const revertButtonEl = document.querySelector<HTMLButtonElement>('#revert')!;
const scanResultEl =
  document.querySelector<HTMLParagraphElement>('#scan-result')!;

let activeTabId: number | undefined;

const PROVIDER_LABELS: Record<RateProvider, string> = {
  dolarapi: 'dolarapi.com',
  bluelytics: 'bluelytics',
  manual: 'manual',
};

function formatAge(fetchedAt: number): string {
  const minutes = Math.round((Date.now() - fetchedAt) / 60_000);
  if (minutes < 1) return 'hace instantes';
  if (minutes === 1) return 'hace 1 minuto';
  return `hace ${minutes} minutos`;
}

function renderRateResult(result: RateResult): void {
  if (result.status === 'error') {
    rateValueEl.textContent = 'No se pudo obtener la cotización.';
    rateMetaEl.textContent = result.message;
    convertButtonEl.disabled = true;
    return;
  }

  const { rate } = result;
  const sourceLabel = PROVIDER_LABELS[rate.provider] ?? rate.provider;

  rateValueEl.textContent = `1 USD = ${rate.value.toLocaleString('es-AR', {
    maximumFractionDigits: 2,
  })} ARS`;
  rateMetaEl.textContent = rate.isStale
    ? `Cotización vencida (${sourceLabel}, ${formatAge(rate.fetchedAt)})`
    : `Fuente: ${sourceLabel} · actualizado ${formatAge(rate.fetchedAt)}`;
  convertButtonEl.disabled = false;
}

async function requestRate(): Promise<RateResult> {
  return (await chrome.runtime.sendMessage({
    type: 'RATE_GET',
  } satisfies Message)) as RateResult;
}

async function refreshRateStatus(): Promise<void> {
  renderRateResult(await requestRate());
}

async function loadConfiguration(): Promise<void> {
  const config = await getConfiguration();
  rateSourceEl.value = config.rateSource;
  manualRateEl.value = String(config.manualRate);
  manualRateFieldEl.hidden = config.rateSource !== 'manual';
}

rateSourceEl.addEventListener('change', () => {
  const rateSource = rateSourceEl.value as 'official' | 'manual';
  manualRateFieldEl.hidden = rateSource !== 'manual';

  void (async () => {
    await setConfiguration({ rateSource });
    await refreshRateStatus();
  })();
});

manualRateEl.addEventListener('change', () => {
  const manualRate = Number(manualRateEl.value);

  if (!isValidManualRate(manualRate)) {
    manualRateErrorEl.textContent =
      'Ingresá un valor mayor a cero y por debajo de 1.000.000.';
    manualRateErrorEl.hidden = false;
    return;
  }

  manualRateErrorEl.hidden = true;

  void (async () => {
    await setConfiguration({ manualRate });
    await refreshRateStatus();
  })();
});

convertButtonEl.addEventListener('click', () => {
  void runConversion();
});

async function runConversion(): Promise<void> {
  scanResultEl.textContent = '';
  convertButtonEl.disabled = true;

  try {
    const rateResult = await requestRate();
    if (rateResult.status === 'error') {
      scanResultEl.textContent = rateResult.message;
      return;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      scanResultEl.textContent = 'No se encontró una pestaña activa.';
      return;
    }

    activeTabId = tab.id;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-script.js'],
    });

    const config = await getConfiguration();
    const hostname = tab.url
      ? normalizeHostname(new URL(tab.url).hostname)
      : '';
    const rules = hostname
      ? ((await chrome.runtime.sendMessage({
          type: 'RULES_GET',
          hostname,
        } satisfies Message)) as Array<SuppressionRule>)
      : [];

    const scanMessage: Message = {
      type: 'SCAN_RUN',
      rate: rateResult.rate,
      minConfidence: config.minConfidence,
      rules,
    };
    const summary = (await chrome.tabs.sendMessage(
      tab.id,
      scanMessage,
    )) as ScanSummary;

    scanResultEl.textContent = `${summary.totalAnnotated} montos convertidos (alta: ${summary.byConfidence.high}, media: ${summary.byConfidence.medium}, baja: ${summary.byConfidence.low}).`;
    revertButtonEl.disabled = false;
  } catch {
    scanResultEl.textContent = 'No se pudo convertir en esta página.';
  } finally {
    convertButtonEl.disabled = false;
  }
}

revertButtonEl.addEventListener('click', () => {
  void (async () => {
    if (activeTabId === undefined) return;

    await chrome.tabs.sendMessage(activeTabId, {
      type: 'SCAN_REVERT',
    } satisfies Message);
    scanResultEl.textContent = '';
    revertButtonEl.disabled = true;
  })();
});

void loadConfiguration();
void refreshRateStatus();
