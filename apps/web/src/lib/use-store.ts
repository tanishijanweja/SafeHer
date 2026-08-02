"use client";

import { useSyncExternalStore } from "react";

import { getStoreVersion, subscribeStore } from "./store";

/**
 * Subscribes a component to the data store. Any create/update/delete in the
 * store bumps the version, so every subscribed component re-renders and reads
 * the latest data through the store's getter functions.
 */
export function useStoreVersion(): number {
  return useSyncExternalStore(subscribeStore, getStoreVersion, getStoreVersion);
}
