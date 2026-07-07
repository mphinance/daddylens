// Typed wrapper around runtime.sendMessage for the content script → worker RPC.

import browser from 'webextension-polyfill';
import type { LensQuery, LensResponse } from '../shared/types';

export async function queryLens(symbol: string): Promise<LensResponse> {
  const msg: LensQuery = { type: 'LENS_QUERY', symbol };
  return (await browser.runtime.sendMessage(msg)) as LensResponse;
}
