// Options page controller: load settings into the form, persist on save.

import { getSettings, setSettings, DEFAULT_SETTINGS } from '../shared/settings';
import type { Settings, Trigger } from '../shared/types';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const apiKey = $<HTMLInputElement>('apiKey');
const toggleKey = $<HTMLButtonElement>('toggleKey');
const demoMode = $<HTMLInputElement>('demoMode');
const modeState = $<HTMLParagraphElement>('modeState');
const bareDomains = $<HTMLTextAreaElement>('bareDomains');
const disabledDomains = $<HTMLTextAreaElement>('disabledDomains');
const saveBtn = $<HTMLButtonElement>('save');
const savedMsg = $<HTMLSpanElement>('saved');

const linesToList = (v: string): string[] =>
  v.split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean);

function selectedTrigger(): Trigger {
  const el = document.querySelector<HTMLInputElement>('input[name="trigger"]:checked');
  return (el?.value as Trigger) ?? 'click';
}

function refreshModeState(): void {
  const live = !demoMode.checked && apiKey.value.trim().length > 0;
  modeState.textContent = live
    ? 'Live mode — using your key against api.traderdaddy.pro.'
    : 'Demo mode — sample data. Add a key and uncheck demo to go live.';
}

function fill(s: Settings): void {
  apiKey.value = s.apiKey ?? '';
  demoMode.checked = s.demoMode;
  bareDomains.value = s.bareSymbolDomains.join('\n');
  disabledDomains.value = s.disabledDomains.join('\n');
  const trigger = document.querySelector<HTMLInputElement>(`input[name="trigger"][value="${s.trigger}"]`);
  if (trigger) trigger.checked = true;
  refreshModeState();
}

async function save(): Promise<void> {
  const key = apiKey.value.trim();
  await setSettings({
    apiKey: key || null,
    demoMode: demoMode.checked,
    trigger: selectedTrigger(),
    bareSymbolDomains: bareDomains.value.trim() ? linesToList(bareDomains.value) : DEFAULT_SETTINGS.bareSymbolDomains,
    disabledDomains: linesToList(disabledDomains.value),
  });
  savedMsg.textContent = 'Saved';
  savedMsg.classList.add('show');
  setTimeout(() => savedMsg.classList.remove('show'), 1500);
}

toggleKey.addEventListener('click', () => {
  const show = apiKey.type === 'password';
  apiKey.type = show ? 'text' : 'password';
  toggleKey.textContent = show ? 'Hide' : 'Show';
});
apiKey.addEventListener('input', refreshModeState);
demoMode.addEventListener('change', refreshModeState);
saveBtn.addEventListener('click', () => void save());

void getSettings().then(fill);
