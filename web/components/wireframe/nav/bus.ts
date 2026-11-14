"use client";

export function subscribe(name: string, onChange: () => void): () => void {
  window.addEventListener(name, onChange);
  return () => window.removeEventListener(name, onChange);
}

export function ping(name: string): void {
  window.dispatchEvent(new Event(name));
}
