import { useState, useEffect } from 'react';
import { useWorldStore } from '../store/useWorldStore.js';
import { useProjectStore } from '../store/useProjectStore.js';
import type { Character, Location } from '../../../shared/types/index.js';
import { apiFetch } from '../lib/api.js';
import { api } from '../lib/routes.js';

export function useWorldEntities() {
  const [worldCharacters, setWorldCharacters] = useState<Record<string, Character>>({});
  const [worldLocations, setWorldLocations] = useState<Record<string, Location>>({});
  const [isLoading, setIsLoading] = useState(false);

  const worldId = useWorldStore(s => s.worldId);
  const projectId = useProjectStore(s => s.selectedProjectId);

  useEffect(() => {
    if (!worldId) return;
    let isMounted = true;

    async function fetchWorldEntities() {
      try {
        setIsLoading(true);
        const data = await apiFetch(api.worlds.entities(worldId!));

        if (isMounted) {
          const chars: Record<string, Character> = {};
          const locs: Record<string, Location> = {};

          data.characters?.forEach((c: Character) => {
            if (c.projectId !== projectId) chars[c.id] = c;
          });
          data.locations?.forEach((l: Location) => {
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
