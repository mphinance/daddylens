import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSymbols, isLikelyBareSymbol } from '../src/shared/symbols';

test('cashtags resolve everywhere, even stopwords', () => {
  const m = findSymbols('watching $NVDA and $IT today', false);
  assert.deepEqual(m.map((x) => x.symbol), ['NVDA', 'IT']);
  assert.ok(m.every((x) => x.cashtag));
});

test('bare symbols ignored when not allowed', () => {
  assert.equal(findSymbols('NVDA is ripping', false).length, 0);
});

test('bare symbols resolve when allowed, minus stopwords', () => {
  const m = findSymbols('NVDA and AMD are IT for the ETF crowd', true);
  assert.deepEqual(m.map((x) => x.symbol), ['NVDA']);
});

test('cashtag class suffix (BRK.A) is captured', () => {
  const m = findSymbols('holding $BRK.A', false);
  assert.equal(m[0].symbol, 'BRK.A');
});

test('bare match adjacent to $ is not double-counted', () => {
  const m = findSymbols('$TSLA', true);
  assert.equal(m.length, 1);
  assert.equal(m[0].cashtag, true);
});

test('stopword filter', () => {
  assert.equal(isLikelyBareSymbol('ALL'), false);
  assert.equal(isLikelyBareSymbol('ETF'), false);
  assert.equal(isLikelyBareSymbol('NVDA'), true);
  assert.equal(isLikelyBareSymbol('X'), false); // too short for bare
});
