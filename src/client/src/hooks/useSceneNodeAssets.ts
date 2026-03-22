import { useMemo } from 'react';
import { useAssetStore } from '../store/useAssetStore.js';
import { safeBestAssets, type BestAssets } from '../store/selectors/assetsSelector.js';

const EMPTY_CHARACTER_ASSETS: BestAssets[] = [];

export function useSceneNodeAssets(
  sceneId: string,
  locationId: string | null,
  characterIds: readonly string[],
) {
  const sceneAssets = useAssetStore(s => safeBestAssets(s, sceneId));
  const locationAssets = useAssetStore(s => safeBestAssets(s, locationId));

  const characterAssets = useMemo(
    () => characterIds.length > 0
      ? characterIds.map(id => safeBestAssets(useAssetStore.getState(), id))
      : EMPTY_CHARACTER_ASSETS,
    [characterIds]
  );

  return { sceneAssets, locationAssets, characterAssets } as const;
}