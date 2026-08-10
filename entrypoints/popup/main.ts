import {
  isValidManualRate,
  type RateResult,
} from '../../src/background/rate-service';
import { getConfiguration, setConfiguration } from '../../src/config/store';
import {
  normalizeHostname,
  type SuppressionReason,
  type SuppressionRule,
  type SuppressionScope,
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
const rulesListEl = document.querySelector<HTMLUListElement>('#rules-list')!;
const rulesEmptyEl =
  document.querySelector<HTMLParagraphElement>('#rules-empty')!;
const clearRulesButtonEl =
  document.querySelector<HTMLButtonElement>('#clear-rules')!;
const showSuppressedEl =
  document.querySelector<HTMLInputElement>('#show-suppressed')!;

let activeTabId: number | undefined;
let activeHostname = '';

const PROVIDER_LABELS: Record<RateProvider, string> = {
  dolarapi: 'dolarapi.com',
  bluelytics: 'bluelytics',
  manual: 'manual',
};

const REASON_LABELS: Record<SuppressionReason, string> = {
  'not-a-price': 'No es un precio',
  'not-ars': 'No está en pesos',
};

const SCOPE_LABELS: Record<SuppressionScope, string> = {
  token: 'texto exacto',
  location: 'esta ubicación',
  'location-group': 'ubicaciones similares',
};

/**
 * Extracts and normalizes the hostname from a tab URL. Pure so it can be
 * reused both at popup load, to resolve the current site's suppression
 * rules, and inside `runConversion`, without a second `chrome.tabs.query`.
 *
 * @param {string} [url] The tab URL, if available.
 * @returns {string} The normalized hostname, or an empty string when there is none.
 */
function hostnameFromTabUrl(url?: string): string {
  return url ? normalizeHostname(new URL(url).hostname) : '';
}

function renderRules(rules: Array<SuppressionRule>): void {
  rulesListEl.replaceChildren();
  rulesEmptyEl.hidden = rules.length > 0;
  clearRulesButtonEl.disabled = rules.length === 0;

  for (const rule of rules) {
    const item = document.createElement('li');

    const label = document.createElement('span');
    label.textContent = `${REASON_LABELS[rule.reason]} (${SCOPE_LABELS[rule.scope]})`;
    item.appendChild(label);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Quitar';
    removeButton.addEventListener('click', () => {
      void removeRuleAndReload(rule.id);
    });
    item.appendChild(removeButton);

    rulesListEl.appendChild(item);
  }
}

async function loadRules(): Promise<void> {
  if (!activeHostname) {
    renderRules([]);
    return;
  }

  const rules = (await chrome.runtime.sendMessage({
    type: 'RULES_GET',
    hostname: activeHostname,
  } satisfies Message)) as Array<SuppressionRule>;
  renderRules(rules);
}

async function removeRuleAndReload(ruleId: string): Promise<void> {
  await chrome.runtime.sendMessage({
    type: 'RULES_REMOVE',
    hostname: activeHostname,
    ruleId,
  } satisfies Message);
  await loadRules();
}

clearRulesButtonEl.addEventListener('click', () => {
  void (async () => {
    await chrome.runtime.sendMessage({
      type: 'RULES_CLEAR',
      hostname: activeHostname,
    } satisfies Message);
    await loadRules();
  })();
});

async function initializeRules(): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  activeHostname = hostnameFromTabUrl(tab?.url);
  await loadRules();
}

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
  showSuppressedEl.checked = config.showSuppressed;
}

showSuppressedEl.addEventListener('change', () => {
  void setConfiguration({ showSuppressed: showSuppressedEl.checked });
});

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
    const hostname = hostnameFromTabUrl(tab.url);
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
      showSuppressed: config.showSuppressed,
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
void initializeRules();
