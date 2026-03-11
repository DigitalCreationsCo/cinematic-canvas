// src/client/src/hooks/useSignOut.ts
// Composes the sign-out action across all stores.
// Use this hook in components that need a sign-out button.
// Auth context's signOut also calls the same store.getState() pattern directly
// for non-component contexts.

import { useAuth } from '../lib/auth-context.js';
import { useProjectStore } from '../store/useProjectStore.js';
import { useAssetStore }   from '../store/useAssetStore.js';
import { usePipelineStore } from '../store/usePipelineStore.js';

export function useSignOut() {
  const { signOut } = useAuth();
  return signOut;
  // signOut in auth-context already calls all three store clearers.
  // This hook exists as a stable import target for components
  // so they don't need to import auth-context directly.
}
