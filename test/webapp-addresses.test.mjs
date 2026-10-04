import test from 'node:test';
import assert from 'node:assert/strict';
import { webAppAddresses } from '../src/webapp-addresses.mjs';

test('address choices include named LAN adapters, deduplicate and exclude non-LAN addresses', () => {
  const item = (address, extra = {}) => ({ address, family: 'IPv4', internal: false, ...extra });
  const choices = webAppAddresses('pixelmug-studio.local', {
    WLAN: [item('172.16.30.5'), item('fe80::1', { family: 'IPv6' })],
    Ethernet: [item('192.168.1.2'), item('10.0.0.2'), item('172.16.30.5')],
    Meta: [item('198.18.0.1')],
    Loopback: [item('127.0.0.1', { internal: true })],
    Disconnected: [item('169.254.1.2')],
  });
  assert.deepEqual(choices.map(item => item.host), ['pixelmug-studio.local', '172.16.30.5', '192.168.1.2', '10.0.0.2']);
  assert.match(choices[1].label, /WLAN/);
  assert.equal(webAppAddresses('pixelmug-studio.local', {}).length, 1);
});