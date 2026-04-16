import { Card, CardContent, CardHeader, CardTitle } from "#client/components/ui/card.js";
import { Button } from "#client/components/ui/button.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "#client/components/ui/tooltip.js";
import { Image as ImageIcon, RefreshCw, Trash2, History } from "lucide-react";
import { Skeleton } from "#client/components/ui/skeleton.js";
import { memo } from "react";
import { DynamicAspectRatioImage, type ImageDimensions } from "./ui/dynamic-aspect-ratio-image.js";

interface FramePreviewProps {
  title: string;
  imageUrl?: string;
  alt: string;
  isLoading?: boolean;
  onRegenerate?: () => void;
  onDelete?: () => void;
  onHistory?: () => void;
  isGenerating: boolean;
  priority?: boolean;
  scrollable?: boolean;
  metadata?: ImageDimensions;
}

const FramePreview = memo(function FramePreview({ title, imageUrl, alt, isLoading, onRegenerate, onDelete, onHistory, isGenerating, priority = false, scrollable = false, metadata }: FramePreviewProps) {
  return (
    <div data-testid={`frame-preview-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="p-0 pb-2 flex-row items-center justify-between">
        <CardTitle className=" font-medium text-muted-foreground uppercase">
          {isLoading ? <Skeleton className="h-4 w-24" /> : title}
        </CardTitle>
        <div className="flex items-center gap-1">
          {onHistory && !isLoading && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onHistory}>
                  <History className="h-3 w-3" />
                  <span className="sr-only">History</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View History</TooltipContent>
            </Tooltip>
          )}
          {onDelete && !isLoading && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" disabled={!imageUrl} size="icon" className="h-6 w-6 hover:text-destructive" onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Are you sure you want to delete this frame? It will be removed from the scene.")) {
                    onDelete();
                  }
                }}>
                  <Trash2 className="h-3 w-3" />
                  <span className="sr-only">Delete</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          )}
          {onRegenerate && !isLoading && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="icon"
                  className="h-6 w-6 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white hover:opacity-90 transition-opacity"
                  onClick={onRegenerate}
                >
                  <RefreshCw className="h-3 w-3" />
                  <span className="sr-only">Regenerate</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Generate New</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0 pt-0 relative">
        {isGenerating && (
          <div className="absolute inset-3 flex items-center justify-center bg-background/10 z-10">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{"Generating frame..."}</span>
            </div>
          </div>
        )}
        {isLoading ? (
          <Skeleton className="w-full" style={{ aspectRatio: metadata?.width && metadata?.height ? `${metadata.width}/${metadata.height}` : '16/9' }} />
        ) : scrollable ? (
          <div className="bg-muted max-h-[600px] overflow-y-auto rounded-none">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={alt}
                className="w-full h-auto"
                loading={priority ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={priority ? "high" : "auto"}
              />
            ) : (
              <div className="w-full h-48 flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
              </div>
            )}
          </div>
        ) : (
          <DynamicAspectRatioImage
            imageUrl={imageUrl}
            metadata={metadata}
            alt={alt}
            objectFit="cover"
            priority={priority}
            className="overflow-hidden"
          />
        )}
      </CardContent>
    </div>
  );
});

export default FramePreview;
