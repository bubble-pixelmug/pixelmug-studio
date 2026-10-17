/// <reference types="vite/client" />

declare module '*StudioMpsAdapter.js' {
  export function studioInstallMps(app: unknown, device: unknown, timeoutMillis?: number): Promise<unknown>;
}
