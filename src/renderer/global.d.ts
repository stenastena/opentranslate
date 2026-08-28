// Ambient type for the API preload scripts expose via contextBridge.
// Individual preload/renderer pairs (popup, settings) extend this as they
// are implemented in later issues.
export {};

declare global {
  interface Window {
    electronAPI?: Record<string, unknown>;
  }
}
