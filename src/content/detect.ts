// Domain-aware detection entry. Decides whether bare-uppercase symbols are
// enabled for the current host, then delegates matching to shared/symbols.

import { findSymbols, type Match } from '../shared/symbols';
import type { Settings } from '../shared/types';

/** Does `host` match an allowlist entry (exact or subdomain)? */
export function hostMatches(host: string, list: string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return list.some((d) => {
    const dd = d.toLowerCase().replace(/^www\./, '');
    return h === dd || h.endsWith('.' + dd);
  });
}

export function bareAllowedFor(host: string, settings: Settings): boolean {
  return hostMatches(host, settings.bareSymbolDomains);
}

export function domainDisabled(host: string, settings: Settings): boolean {
  return hostMatches(host, settings.disabledDomains);
}

export function detectInText(text: string, host: string, settings: Settings): Match[] {
  return findSymbols(text, bareAllowedFor(host, settings));
}
