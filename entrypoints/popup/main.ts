import {
  isTabActive,
  setTabActive,
} from '../../src/background/active-tabs';
import {
  isValidManualRate,
  type RateResult,
} from '../../src/background/rate-service';
import { getConfiguration, setConfiguration } from '../../src/config/store';
import type { RateHouse } from '../../src/core/types';
import type { Message } from '../../src/shared/messages';
import {
  formatRateAge,
  RATE_PROVIDER_LABELS,
  RATE_SOURCE_LABELS,
} from '../../src/shared/rate-display';

const activateEl = document.querySelector<HTMLInputElement>('#activate')!;
const rateHouseEl = document.querySelector<HTMLParagraphElement>('#rate-house')!;
const rateValueEl =
  document.querySelector<HTMLParagraphElement>('#rate-value')!;
const rateMetaEl = document.querySelector<HTMLParagraphElement>('#rate-meta')!;
const rateSourceEl = document.querySelector<HTMLSelectElement>('#rate-source')!;
const manualRateFieldEl =
  document.querySelector<HTMLDivElement>('#manual-rate-field')!;
const manualRateEl = document.querySelector<HTMLInputElement>('#manual-rate')!;
const manualRateErrorEl =
  document.querySelector<HTMLParagraphElement>('#manual-rate-error')!;

function renderRateResult(result: RateResult): void {
  if (result.status === 'error') {
    rateValueEl.textContent = 'No se pudo obtener la cotización.';
    rateMetaEl.textContent = result.message;
    return;
  }

  const { rate } = result;
  const sourceLabel = RATE_PROVIDER_LABELS[rate.provider] ?? rate.provider;

  rateValueEl.textContent = `1 USD = ${rate.value.toLocaleString('es-AR', {
    maximumFractionDigits: 2,
  })} ARS`;
  rateMetaEl.textContent = rate.isStale
    ? `Cotización vencida (${sourceLabel}, ${formatRateAge(rate.fetchedAt)})`
    : `Fuente: ${sourceLabel} · actualizado ${formatRateAge(rate.fetchedAt)}`;
}

async function requestRate(): Promise<RateResult> {
  return (await chrome.runtime.sendMessage({
    type: 'RATE_GET',
  } satisfies Message)) as RateResult;
}

async function refreshRateStatus(): Promise<void> {
  renderRateResult(await requestRate());
}

function renderRateHouse(rateSource: RateHouse | 'manual'): void {
  rateHouseEl.textContent = RATE_SOURCE_LABELS[rateSource];
}

async function loadConfiguration(): Promise<void> {
  const config = await getConfiguration();
  rateSourceEl.value = config.rateSource;
  manualRateEl.value = String(config.manualRate);
  manualRateFieldEl.hidden = config.rateSource !== 'manual';
  renderRateHouse(config.rateSource);
}

rateSourceEl.addEventListener('change', () => {
  const rateSource = rateSourceEl.value as RateHouse | 'manual';
  manualRateFieldEl.hidden = rateSource !== 'manual';
  renderRateHouse(rateSource);

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
  const nextActive = activateEl.checked;

  void (async () => {
    const tabId = await currentTabId();
    if (tabId === undefined) {
      activateEl.checked = !nextActive;
      return;
    }

    try {
      if (nextActive) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-script.js'],
        });
        await chrome.tabs.sendMessage(tabId, {
          type: 'ACTIVATE',
        } satisfies Message);
      } else {
        // Best effort: a tab that was never activated has no listener to
        // receive this, and that failure is not a reason to keep the toggle
        // from turning off.
        await chrome.tabs
          .sendMessage(tabId, { type: 'DEACTIVATE' } satisfies Message)
          .catch(() => {});
      }

      await setTabActive(tabId, nextActive);
    } catch {
      // Injection fails on pages the extension cannot script, such as
      // chrome:// URLs or the Chrome Web Store. Reflect that in the toggle
      // instead of claiming a session that does not exist.
      activateEl.checked = !nextActive;
    }
  })();
});

async function loadActivation(): Promise<void> {
  const tabId = await currentTabId();
  activateEl.checked = tabId !== undefined && (await isTabActive(tabId));
}

void loadActivation();
void loadConfiguration();
void refreshRateStatus();
