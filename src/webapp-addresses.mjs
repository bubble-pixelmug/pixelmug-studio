import { networkInterfaces } from 'node:os';

export function webAppAddresses(hostname = 'pixelmug-studio.local', interfaces = networkInterfaces()) {
  const choices = [{ host: hostname, label: hostname + '（mDNS）' }];
  const seen = new Set([hostname]);
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.internal || entry.family !== 'IPv4' || seen.has(entry.address)) continue;
      // Offer private LAN addresses, not link-local or proxy benchmark ranges.
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) continue;
      seen.add(entry.address);
      choices.push({ host: entry.address, label: entry.address + '（' + name + '）' });
    }
  }
  return choices;
}