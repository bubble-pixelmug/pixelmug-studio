import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LaunchManager, reconcileRestartPlan } from '../src/launch.mjs';
import { BindingRegistry } from '../src/bindings.mjs';
import { bindingsForDisplayedSlots, displayBotSlots } from '../src/slot-display.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function managerWithBindings(records) {
  const manager = Object.create(LaunchManager.prototype);
  manager.bindings = { records: new Map(records.map((record, index) => [String(index), record])) };
  return manager;
}

test('authorizes a live Bot slot without checking the Studio account owner', () => {
  const manager = managerWithBindings([
    { device: { deviceId: 'mug-a', slotId: 'slot-1', online: true }, scope: { chat: { id: 'group-1' } } },
    { device: { deviceId: 'mug-b', slotId: 'slot-2', online: true }, scope: { chat: { id: 'group-1' } } },
  ]);
  assert.deepEqual(manager.authorizeBoundDevice({ deviceId: 'mug-b', slotId: 'slot-2' }), {
    deviceId: 'mug-b', slotId: 'slot-2',
  });
});

test('rejects unbound, mismatched, and offline devices', () => {
  const manager = managerWithBindings([
    { device: { deviceId: 'mug-a', slotId: 'slot-1', online: false } },
  ]);
  assert.throws(() => manager.authorizeBoundDevice({ deviceId: 'mug-b', slotId: 'slot-1' }), /not bound/);
  assert.throws(() => manager.authorizeBoundDevice({ deviceId: 'mug-a', slotId: 'slot-2' }), /not bound/);
  assert.throws(() => manager.authorizeBoundDevice({ deviceId: 'mug-a', slotId: 'slot-1' }), /not online/);
  assert.deepEqual(manager.authorizeBoundDevice({ deviceId: 'mug-a', slotId: 'slot-1' }, { allowOffline: true }), {
    deviceId: 'mug-a', slotId: 'slot-1',
  });
  manager.bindings.records.clear();
  assert.throws(() => manager.authorizeBoundDevice({ deviceId: 'mug-a', slotId: 'slot-1' }, { allowOffline: true }), /not bound/);
});

test('authorizes the selected chat binding when another chat has an offline snapshot', () => {
  const manager = managerWithBindings([
    { contextId: 'old-chat', device: { deviceId: 'shared-mug', slotId: 'slot-1', online: false } },
    { contextId: 'current-chat', device: { deviceId: 'shared-mug', slotId: 'slot-1', online: true } },
  ]);
  const ref = { deviceId: 'shared-mug', slotId: 'slot-1' };
  assert.deepEqual(manager.authorizeBoundDevice(ref), ref);
  assert.deepEqual(manager.authorizeBoundDevice({ ...ref, contextId: 'current-chat' }), ref);
  assert.deepEqual(manager.authorizeBoundDevice({ ...ref, contextId: 'sdk-launch-context' }), ref);
  assert.throws(() => manager.authorizeBoundDevice({ ...ref, contextId: 'old-chat' }), /not online/);
});

test('unknown online status does not block a bound device', () => {
  const manager = managerWithBindings([
    { contextId: 'chat', device: { deviceId: 'mug-a', slotId: 'slot-1' } },
  ]);
  assert.deepEqual(manager.authorizeBoundDevice({ deviceId: 'mug-a', slotId: 'slot-1', contextId: 'chat' }),
    { deviceId: 'mug-a', slotId: 'slot-1' });
});

test('reuses a reboot for the same physical device after its Bot slot changes', () => {
  const plan = { deviceId: 'mug-a', slotId: 'old-slot', requestId: 'launch-1', state: 'waiting' };
  const plans = new Map([['mug-a', plan]]);
  assert.equal(reconcileRestartPlan(plans, { deviceId: 'mug-a', slotId: 'new-slot' }), plan);
  assert.equal(plan.slotId, 'new-slot');
  assert.equal(plan.requestId, 'launch-1');
  assert.equal(reconcileRestartPlan(plans, { deviceId: 'mug-b', slotId: 'new-slot' }), undefined);
});

test('discards an unfinished reboot plan when a device moves to another slot', () => {
  const plans = new Map([['mug-a', { deviceId: 'mug-a', slotId: 'old-slot', state: 'failed' }]]);
  assert.equal(reconcileRestartPlan(plans, { deviceId: 'mug-a', slotId: 'new-slot' }), null);
  assert.equal(plans.size, 0);
});

test('shows the selected chat in exactly the registered slots, including empty slots', () => {
  const slots = [{ id: 'creator-slot-1', device: { id: 'mine' } }, { id: 'creator-slot-2', device: null }];
  const bindings = [
    { chat: { id: 'group-a', type: 'group' }, device: { deviceId: 'theirs', slot: 2, name: 'Theirs', online: true } },
  ];
  const visible = displayBotSlots(slots, bindings, [], { id: 'group-a', type: 'group' });
  assert.equal(visible.length, 2);
  assert.equal(visible[0].device, null);
  assert.equal(visible[1].device.id, 'theirs');
  assert.equal(visible[1].device.name, 'Theirs');
  assert.equal(visible[0].chatBound, true);
  assert.equal(visible[1].chatId, 'group-a');
});

test('debug navigation matches the selected chat and slot order', () => {
  const slots = [{ id: 'slot-1' }, { id: 'slot-2' }];
  const bindings = [
    { chat: { id: 'group-a', type: 'group' }, device: { deviceId: 'astro', slot: 1, name: 'Astro' } },
    { chat: { id: 'private-b', type: 'private' }, device: { deviceId: 'horse', slot: 1, name: 'horse' } },
    { chat: { id: 'private-b', type: 'private' }, device: { deviceId: 'red-heart', slot: 2, name: 'red heart' } },
  ];
  const visibleSlots = displayBotSlots(slots, bindings, [], { id: 'private-b', type: 'private' });
  assert.deepEqual(visibleSlots.map(slot => slot.device?.id), ['horse', 'red-heart']);
  assert.deepEqual(bindingsForDisplayedSlots(visibleSlots, bindings).map(binding => binding?.device.deviceId), ['horse', 'red-heart']);
  assert.deepEqual(bindingsForDisplayedSlots([], bindings), []);
});

test('forwards an MPY event from WebREPL to the Bot execution subscriber', () => {
  const manager = Object.create(LaunchManager.prototype);
  manager.clients = new Map();
  manager.log = () => {};
  const owner = { key: 'bot:local', ownerId: 'executor-1' };
  const job = { id: 'launch-1', device: { deviceId: 'mug-a', slotId: 'slot-1' },
    state: 'running', owners: new Map([['executor', owner]]) };
  assert.equal(manager.deviceEvent(job, 'BDB2|round|1|READY|0'), true);
  assert.deepEqual(manager.client(owner.key).events.map(event => event.value), ['BDB2|round|1|READY|0']);
  assert.equal(manager.deviceEvent(job, 'x'.repeat(513)), false);
  assert.equal(manager.client(owner.key).events.length, 1);
});
