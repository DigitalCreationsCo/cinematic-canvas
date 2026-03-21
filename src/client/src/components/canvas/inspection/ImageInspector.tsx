import React from 'react';
import type { CanvasNode, ImageNodeFlag } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useLocationAssets } from '../../../store/useAssetStore.js';
import { Label } from '../../ui/label.js';
import { Textarea } from '../../ui/textarea.js';

const FLAG_LABELS: Record<ImageNodeFlag, string> = {
  style_reference: 'Style Reference',
  lore: 'Lore Image',
  import: 'Imported Image',
  composite_output: 'Composite Target'
};

export function ImageInspector({ node }: { node: CanvasNode; }) {
  const entity = useProjectStore((state) => state.locations.get(node.data.entityId));
  const { assets } = useLocationAssets(node.data.entityId);
  const flag = node.data.nodeTypeFlag || 'import';
  const isLocked = node.data.isLocked;

  if (!entity && flag !== 'composite_output') return <div className="p-4 text-gray-500">Image unlinked</div>;

  return (
    <div className="p-4 flex flex-col h-full bg-gray-950 text-gray-200">
      <div className="mb-4 pb-4 border-b border-gray-800">
        <h2 className="text-xl font-bold text-gray-100">
          { entity?.name || 'Image Content' }
        </h2>
        <span className="text-xs text-gray-400 uppercase tracking-widest mt-1 block">
          { FLAG_LABELS[ flag ] }
        </span>
      </div>

      <div className="space-y-4">
        { assets?.location_image?.versions?.[ 0 ]?.data && (
          <div className="bg-gray-900 border flex items-center justify-center p-1 rounded-lg border-gray-800 overflow-hidden mb-6">
            <img
              src={ assets.location_image.versions[ 0 ].data }
              alt="Inspector Preview"
              className="w-full max-h-64 object-contain"
            />
          </div>
        ) }

        { flag === 'lore' && (
          <div className="space-y-2">
            <Label className="text-gray-400 text-xs uppercase">Lore Context</Label>
            <Textarea
              className="resize-none h-32 bg-gray-900 border-gray-700 disabled:opacity-60 text-sm"
              value={ assets?.location_description?.versions?.[ 0 ]?.data || '' }
              disabled={ true }
              placeholder="What does this image mean in the world building context?"
            />
          </div>
        ) }
      </div>
    </div>
  );
}
