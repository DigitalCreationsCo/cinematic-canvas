import React, { memo } from 'react';
import type { CanvasNode, ImageNodeFlag } from '../../../domain/canvas/NodeTypes.js';
import { useAssetStore } from '../../../store/useAssetStore.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.js';
import { Badge } from '../../ui/badge.js';
import { Button } from '../../ui/button.js';
import { ScrollArea } from '../../ui/scroll-area.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.js';
import { Image as ImageIcon, Info, FileText, Maximize2, FileType, Hash, Clock } from 'lucide-react';
import { getAllBestAssets } from '../../../../../shared/utils/assets-utils.js';
import { resolvePublicUrl } from '../../../../../shared/utils/utils.js';

const FLAG_CONFIG: Record<ImageNodeFlag, { label: string; colorClass: string }> = {
  style_reference: { label: 'Style Reference', colorClass: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  lore: { label: 'Lore Image', colorClass: 'bg-slate-500/20 text-slate-400 border-slate-500/40' },
  import: { label: 'Imported Image', colorClass: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  composite_output: { label: 'Composite Output', colorClass: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/40' },
};

function extractFileName(entityId: string): string {
  if (entityId.startsWith('imported_')) {
    return entityId.replace('imported_', '').replace(/[-_]/g, ' ');
  }
  return entityId.slice(0, 12);
}

function extractExtension(dataUrl: string | undefined): string {
  if (!dataUrl) return 'Unknown';
  const match = dataUrl.match(/data:image\/(\w+);/);
  return match ? match[1].toUpperCase() : 'Unknown';
}

export const ImageInspector = memo(function ImageInspector({ node }: { node: CanvasNode; }) {
  const assets = useAssetStore((state) => state.assets.get(node.data.entityId) ?? null);
  const bestAssets = getAllBestAssets(assets);
  const flag = (node.data.nodeTypeFlag || 'import') as ImageNodeFlag;
  const isLocked = node.data.isLocked;
  const imgSrc = bestAssets?.image_file?.data;
  const flagConfig = FLAG_CONFIG[flag];
  const metadata = bestAssets?.image_file?.metadata;

  if (!imgSrc && flag !== 'composite_output') {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Image not found</p>
        </div>
      </div>
    );
  }

  const dimensions = metadata?.width && metadata?.height
    ? `${metadata.width} × ${metadata.height}`
    : null;
  const extension = extractExtension(imgSrc);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 flex items-center justify-between gap-4 shrink-0 border-b">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 bg-primary/10 flex items-center justify-center shrink-0">
            <ImageIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold truncate">{extractFileName(node.data.entityId)}</h2>
            <Badge variant="outline" className={`text-[10px] mt-0.5 ${flagConfig.colorClass}`}>
              {flagConfig.label}
            </Badge>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {imgSrc && (
            <Card>
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase">
                    Preview
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="aspect-square bg-muted overflow-hidden rounded-none">
                  <img
                    src={imgSrc}
                    alt="Image Preview"
                    className="w-full h-full object-contain"
                    loading="eager"
                    decoding="async"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="properties" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="properties">Properties</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="properties" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">File Properties</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <FileType className="w-3.5 h-3.5" />
                      Format
                    </span>
                    <span className="font-medium">{extension}</span>
                  </div>

                  {dimensions && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Maximize2 className="w-3.5 h-3.5" />
                        Dimensions
                      </span>
                      <span className="font-medium">{dimensions}px</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Hash className="w-3.5 h-3.5" />
                      Version
                    </span>
                    <span className="font-medium">v{bestAssets?.image_file?.version || 1}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      Created
                    </span>
                    <span className="font-medium text-xs">
                      {bestAssets?.image_file?.createdAt
                        ? new Date(bestAssets.image_file.createdAt).toLocaleDateString()
                        : 'Unknown'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="details" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Metadata</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                  <div className="text-xs space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground">Entity ID:</span>
                      <span className="font-mono text-[10px] truncate">{node.data.entityId}</span>
                    </div>

                    {metadata?.model && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-muted-foreground">Model:</span>
                        <span className="font-medium text-xs truncate">{metadata.model}</span>
                      </div>
                    )}

                    {metadata?.jobId && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-muted-foreground">Job ID:</span>
                        <span className="font-mono text-[10px] truncate">{metadata.jobId}</span>
                      </div>
                    )}

                    {metadata?.prompt && (
                      <div className="pt-2 border-t">
                        <span className="text-muted-foreground block mb-1">Prompt:</span>
                        <p className="font-mono text-[10px] leading-relaxed bg-muted p-2 rounded">
                          {metadata.prompt}
                        </p>
                      </div>
                    )}
                  </div>

                  {!metadata?.model && !metadata?.jobId && !metadata?.prompt && (
                    <p className="text-muted-foreground text-sm">No metadata available</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
});
