import { useState, useEffect } from 'react';
import { useWorldStore } from '../store/useWorldStore.js';
import { useProjectStore } from '../store/useProjectStore.js';
import type { Character, CharacterBase, CharacterEntity, CharacterWithAssets, Location, LocationBase, LocationEntity, LocationWithAssets } from '../../../shared/types/index.js';
import { api } from '#client/lib/api.js';

export function useWorldEntities() {
  const [worldCharacters, setWorldCharacters] = useState<Record<string, CharacterWithAssets>>({});
  const [worldLocations, setWorldLocations] = useState<Record<string, LocationWithAssets>>({});
  const [isLoading, setIsLoading] = useState(false);

  const worldId = useWorldStore(s => s.worldId);
  const projectId = useProjectStore(s => s.selectedProjectId);

  useEffect(() => {
    if (!worldId) return;
    let isMounted = true;

    async function fetchWorldEntities() {
      try {
        setIsLoading(true);
        const data = await api.worlds.entities.query({ worldId: worldId! })

        if (isMounted) {
          const chars: Record<string, CharacterWithAssets> = {};
          const locs: Record<string, LocationWithAssets> = {};

          data.characters?.forEach((c) => {
            if (c.projectId !== projectId) chars[c.id] = c;
          });
          data.locations?.forEach((l) => {
            if (l.projectId !== projectId) locs[l.id] = l;
          });

          setWorldCharacters(chars);
          setWorldLocations(locs);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchWorldEntities();
    return () => { isMounted = false; };
  }, [worldId, projectId]);

  return { worldCharacters, worldLocations, isLoading };
}
