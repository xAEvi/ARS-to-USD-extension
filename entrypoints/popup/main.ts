import {
  isValidManualRate,
  type RateResult,
} from '../../src/background/rate-service';
import { getConfiguration, setConfiguration } from '../../src/config/store';
import { normalizeHostname } from '../../src/core/hostname';
import type { RateHouse } from '../../src/core/types';
import { isHostDisabled, setHostDisabled } from '../../src/shared/disabled-hosts';
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

async function currentTab(): Promise<
  { id: number; hostname: string } | undefined
> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return undefined;

  try {
    return { id: tab.id, hostname: normalizeHostname(new URL(tab.url).hostname) };
  } catch {
    // chrome:// pages and the Chrome Web Store have a URL the popup cannot
    // read as a hostname; the extension never runs there anyway.
    return undefined;
  }
}

// Active on every site by default; this toggle only records a per-hostname
// opt-out (`disabled-hosts.ts`), so unlike the old per-tab session it
// persists across reloads and new tabs on the same site.
activateEl.addEventListener('change', () => {
  const nextActive = activateEl.checked;

  void (async () => {
    const tab = await currentTab();
    if (!tab) {
      activateEl.checked = !nextActive;
      return;
    }

    await setHostDisabled(tab.hostname, !nextActive, tab.id);

    // Best effort: a tab whose content script has not run yet (e.g. the
    // extension was just installed) has no listener to receive this, and
    // that is not a reason to keep the toggle from reflecting the change.
    await chrome.tabs
      .sendMessage(tab.id, {
        type: nextActive ? 'ACTIVATE' : 'DEACTIVATE',
      } satisfies Message)
      .catch(() => {});
  })();
});

async function loadActivation(): Promise<void> {
  const tab = await currentTab();
  activateEl.checked = !tab || !(await isHostDisabled(tab.hostname));
}

void loadActivation();
void loadConfiguration();
void refreshRateStatus();
