import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useLocationAssets } from '../../../store/useAssetStore.js';
import { RbacBanner } from './RbacBanner.js';
import LocationDetailPanel from '#client/components/LocationDetailPanel.js';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';

export function LocationInspector({ node }: { node: CanvasNode; }) {
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);

  const location = useProjectStore((state) => state.locations.get(node.data.entityId));
  const updateLocation = useProjectStore((state) => state.updateLocation);
  const { assets } = useLocationAssets(node.data.entityId);
  const isLocked = node.data.isLocked;
  const isLoading = useCanvasUIStore(s => s.isLoading) && !selectedProjectId;

  if (!selectedProjectId) return <div className="p-4 text-gray-500">No project selected</div>;
  if (!location) return <div className="p-4 text-gray-500">Location not found</div>;

  return (
    <div className="flex flex-col h-full">
      <RbacBanner isLocked={isLocked} entityType="location" />
      <LocationDetailPanel
        location={location}
        projectId={selectedProjectId}
        isLoading={isLoading}
      />
    </div>
  );
};
