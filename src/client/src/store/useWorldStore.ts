// src/client/src/store/useWorldStore.ts
// World-specific state, including SAC attributes and RBAC roles.

import { create } from 'zustand';
import type { SacCommit } from '../../../shared/types/sac.types.js';

type RbacRole = 'owner' | 'editor' | 'collaborator' | 'viewer' | 'licensed_creator';

interface WorldStoreState {
    worldId: string | null;
    role: RbacRole;
    licenseType: string | null;
    worldName: string | null;

    sacRepoId: string | null;
    commitHistory: SacCommit[];
    isDirty: boolean; // Uncommitted changes exist

    setWorld: (worldId: string, role?: RbacRole, licenseType?: string | null) => void;
    setWorldName: (name: string) => void;
    setSacInfo: (repoId: string, history: SacCommit[]) => void;
    markDirty: () => void;
    markClean: () => void;
}

export let getActiveWorldId = () => null as string | null;

export const useWorldStore = create<WorldStoreState>((set) => ({
    worldId: null,
    role: 'viewer', // Safe default
    licenseType: null,
    worldName: null,

    sacRepoId: null,
    commitHistory: [],
    isDirty: false,

    setWorld: (worldId, role = 'viewer', licenseType = null) => {
        set({ worldId, role, licenseType });
        getActiveWorldId = () => worldId;
    },

    setWorldName: (name) => set({ worldName: name }),

    setSacInfo: (repoId, history) =>
        set({ sacRepoId: repoId, commitHistory: history }),

    markDirty: () => set({ isDirty: true }),
    markClean: () => set({ isDirty: false }),
}));
