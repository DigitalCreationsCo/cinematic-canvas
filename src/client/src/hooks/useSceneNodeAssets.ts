import { useShallow } from 'zustand/react/shallow';       // NOT useShallow
import { useAssetStore } from '../store/useAssetStore.js';
import { safeBestAssets, type BestAssets } from '../store/selectors/assetsSelector.js';

const EMPTY_CHARACTER_ASSETS: BestAssets[] = [];

export function useSceneNodeAssets(
  sceneId: string,
  locationId: string | null,
  characterIds: readonly string[],
) {
  // Single-ref selectors: WeakMap cache in getAllBestAssets returns same ref
  // when registry unchanged → Object.is passes → no re-render.
  const sceneAssets = useAssetStore(s => safeBestAssets(s, sceneId));
  const locationAssets = useAssetStore(s => safeBestAssets(s, locationId));

  // ✅ `shallow` as equality fn compares arrays via Object.keys + Object.is
  //    element-by-element, handling the new-array-same-refs case correctly.
  //    Cannot use useShallow here — it wraps an object, and Object.is on the
  //    characterAssets property would compare array refs, always failing.
  const characterAssets = useAssetStore(useShallow(
    s => characterIds.length > 0
      ? characterIds.map(id => safeBestAssets(s, id))
      : EMPTY_CHARACTER_ASSETS,
  ));

  return { sceneAssets, locationAssets, characterAssets } as const;
}