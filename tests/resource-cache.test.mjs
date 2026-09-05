import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ResourceCache } from '../lib/resource-cache.ts';

test('pages reuse the same completed result and deduplicate in-flight loads', async () => {
  const resource = new ResourceCache().get('checkins');
  let calls = 0;
  const load = async () => { calls++; return [80, 60]; };
  await Promise.all([resource.load(load), resource.load(load)]);
  await resource.load(load);
  assert.equal(calls, 1);
  assert.deepEqual(resource.getSnapshot(), { data: [80, 60], loading: false, error: null });
});

test('invalidation keeps content visible and ignores a stale response', async () => {
  const resource = new ResourceCache().get('history');
  const responses = [];
  const load = () => new Promise((resolve) => responses.push(resolve));
  const unsubscribe = resource.subscribe(() => {});
  const first = resource.load(load);
  await Promise.resolve();
  resource.invalidate();
  const fresh = resource.load(load);
  await Promise.resolve();
  responses[1](['new session']);
  await fresh;
  responses[0](['old session']);
  await first;
  assert.deepEqual(resource.getSnapshot().data, ['new session']);
  resource.invalidate();
  assert.equal(resource.getSnapshot().loading, false);
  assert.deepEqual(resource.getSnapshot().data, ['new session']);
  unsubscribe();
});

test('failed background refresh retains cached rows and exposes an error', async () => {
  const resource = new ResourceCache().get('history');
  await resource.load(async () => ['saved session']);
  resource.invalidate();
  await resource.load(async () => { throw new Error('offline'); });
  assert.deepEqual(resource.getSnapshot(), { data: ['saved session'], loading: false, error: 'offline' });
});

test('account caches stay isolated and inactive resources refresh on remount', async () => {
  const firstAccount = new ResourceCache();
  const secondAccount = new ResourceCache();
  const resource = firstAccount.get('checkins');
  await resource.load(async () => ['private']);
  assert.equal(secondAccount.get('checkins').getSnapshot().data, undefined);
  firstAccount.invalidate();
  await resource.load(async () => []);
  assert.deepEqual(resource.getSnapshot().data, []);
});
