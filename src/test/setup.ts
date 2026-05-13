import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@/i18n";

const createStorageShim = (): Storage => {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(String(key)) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(String(key));
    },
    setItem(key: string, value: string) {
      values.set(String(key), String(value));
    },
  };
};

const ensureStorage = (storageKey: "localStorage" | "sessionStorage"): void => {
  if (typeof window === "undefined") return;
  const current = window[storageKey];
  if (
    current &&
    typeof current.clear === "function" &&
    typeof current.getItem === "function" &&
    typeof current.removeItem === "function" &&
    typeof current.setItem === "function"
  ) {
    return;
  }
  Object.defineProperty(window, storageKey, {
    value: createStorageShim(),
    configurable: true,
  });
};

ensureStorage("localStorage");
ensureStorage("sessionStorage");

afterEach(() => {
  cleanup();
});

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
  }
}

if (typeof globalThis !== "undefined" && !(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {
      // noop
    }
    unobserve() {
      // noop
    }
    disconnect() {
      // noop
    }
  };
}
