import {
  isTabActive,
  setTabActive,
} from '../../src/background/active-tabs';
import {
  isValidManualRate,
  type RateResult,
} from '../../src/background/rate-service';
import { getConfiguration, setConfiguration } from '../../src/config/store';
import type { RateProvider } from '../../src/core/types';
import type { Message } from '../../src/shared/messages';

const activateEl = document.querySelector<HTMLInputElement>('#activate')!;
const rateValueEl =
  document.querySelector<HTMLParagraphElement>('#rate-value')!;
const rateMetaEl = document.querySelector<HTMLParagraphElement>('#rate-meta')!;
const rateSourceEl = document.querySelector<HTMLSelectElement>('#rate-source')!;
const manualRateFieldEl =
  document.querySelector<HTMLDivElement>('#manual-rate-field')!;
const manualRateEl = document.querySelector<HTMLInputElement>('#manual-rate')!;
const manualRateErrorEl =
  document.querySelector<HTMLParagraphElement>('#manual-rate-error')!;

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

async function currentTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

activateEl.addEventListener('change', () => {
  void (async () => {
    const tabId = await currentTabId();
    if (tabId === undefined) {
      activateEl.checked = false;
      return;
    }

    if (activateEl.checked)
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-script.js'],
      });

    await setTabActive(tabId, activateEl.checked);
  })();
});

async function loadActivation(): Promise<void> {
  const tabId = await currentTabId();
  activateEl.checked = tabId !== undefined && (await isTabActive(tabId));
}

void loadActivation();
void loadConfiguration();
void refreshRateStatus();
