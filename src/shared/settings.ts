// Settings storage schema + accessors. Backed by browser.storage.local so the
// worker, content script, and options page all share one source of truth.

import browser from 'webextension-polyfill';
import type { Settings } from './types';

const KEY = 'daddylens.settings';

export const DEFAULT_SETTINGS: Settings = {
  apiKey: null,
  demoMode: true, // no key on first run → demo mode
  trigger: 'click',
  bareSymbolDomains: [
    'x.com',
    'twitter.com',
    'reddit.com',
    'stocktwits.com',
    'substack.com',
  ],
  disabledDomains: [],
  baseUrl: 'https://api.traderdaddy.pro',
};

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(KEY);
  const value = stored[KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(value ?? {}) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export function onSettingsChanged(cb: (settings: Settings) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]?.newValue) {
      cb({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<Settings>) });
    }
  });
}

/** Live mode requires a key AND demoMode off. */
export function isLive(s: Settings): boolean {
  return !s.demoMode && !!s.apiKey;
}
