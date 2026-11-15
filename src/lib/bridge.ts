/** Typed access to the preload bridge, with a friendly error in plain-browser dev. */
import type { VybeApi } from "../../electron/preload";

declare global {
  interface Window {
    vybe?: VybeApi;
  }
}

export function hasBridge(): boolean {
  return typeof window !== "undefined" && !!window.vybe;
}

export function requireBridge(): VybeApi {
  if (typeof window === "undefined" || !window.vybe) {
    throw new Error("Not running inside the Vybe desktop shell.");
  }
  return window.vybe;
}
