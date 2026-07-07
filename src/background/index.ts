// Background service worker: routes LENS_QUERY messages to the fetcher, coalesces
// concurrent identical requests, and returns typed card payloads. The td_live_
// key stays here — content scripts only ever receive rendered card data.

import browser from 'webextension-polyfill';
import { getSettings } from '../shared/settings';
import type { LensMessage, LensResponse } from '../shared/types';
import { fetchCards } from './fetcher';

// In-flight coalescing: two popovers opening the same symbol share one fetch.
const inFlight = new Map<string, Promise<LensResponse>>();

async function handleQuery(symbol: string): Promise<LensResponse> {
  const existing = inFlight.get(symbol);
  if (existing) return existing;

  const p = (async (): Promise<LensResponse> => {
    try {
      const settings = await getSettings();
      const { cards, demo, cooling } = await fetchCards(symbol, settings);
      return { type: 'LENS_RESULT', symbol, demo, cards, cooling };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      return { type: 'LENS_ERROR', symbol, code: 'FETCH', message };
    } finally {
      inFlight.delete(symbol);
    }
  })();

  inFlight.set(symbol, p);
  return p;
}

browser.runtime.onMessage.addListener((msg: unknown): Promise<LensResponse> | undefined => {
  const m = msg as LensMessage;
  if (m?.type === 'LENS_QUERY' && typeof m.symbol === 'string') {
    return handleQuery(m.symbol);
  }
  return undefined;
});
