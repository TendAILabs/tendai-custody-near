"use client";

import { useSyncExternalStore } from "react";

function subscribeClient() {
  return () => {};
}

function clientMounted() {
  return true;
}

function serverMounted() {
  return false;
}

export function useClientMounted(): boolean {
  return useSyncExternalStore(subscribeClient, clientMounted, serverMounted);
}
