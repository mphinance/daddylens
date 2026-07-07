// Content-script entry. Loads settings, bails on disabled domains, starts the
// scanner, and routes marker triggers to the popover.

import { getSettings } from '../shared/settings';
import { domainDisabled } from './detect';
import { Scanner } from './scanner';
import { Popover } from './popover/Popover';

async function main(): Promise<void> {
  const settings = await getSettings();
  const host = location.hostname;
  if (domainDisabled(host, settings)) return;

  const popover = new Popover();
  const scanner = new Scanner({
    settings,
    host,
    onTrigger: (symbol, anchor) => void popover.open(symbol, anchor),
  });
  scanner.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void main());
} else {
  void main();
}
