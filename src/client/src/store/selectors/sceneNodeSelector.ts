import type { ProjectStoreState } from '#client/store/useProjectStore.js';
import type { Character } from '#shared/types/workflow.types.js';

const EMPTY_IDS: readonly string[] = [];
const EMPTY_CHARS: Character[] = [];

export const createSceneNodeSelector = (entityId: string) => {
    let prevIds: readonly string[] = EMPTY_IDS;
    let prevCharRefs: ReadonlyArray<Character | undefined> = [];
    let stableChars: Character[] = EMPTY_CHARS;

    return (state: ProjectStoreState) => {
        const scene = state.scenes.get(entityId);
        if (!scene) return null;

        const location = scene.locationId
            ? (state.locations.get(scene.locationId) ?? null)
            : null;

        // ✅ Never allocates new []. Uses module-level EMPTY_IDS when empty/undefined.
        const ids: readonly string[] =
            scene.characterIds && scene.characterIds.length > 0
                ? scene.characterIds
                : EMPTY_IDS;

        let dirty = ids !== prevIds;
        if (!dirty) {
            for (let i = 0; i < ids.length; i++) {
                if (state.characters.get(ids[i]) !== prevCharRefs[i]) { dirty = true; break; }
            }
        }

        if (dirty) {
            prevIds = ids;
            prevCharRefs = ids.map(id => state.characters.get(id));
            const resolved = prevCharRefs.filter((c): c is Character => c !== undefined);
            // ✅ Never allocates new [] for empty case
            stableChars = resolved.length > 0 ? resolved : EMPTY_CHARS;
        }

        return { scene, location, characters: stableChars };
    };
};