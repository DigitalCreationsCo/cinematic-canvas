import { useMemo, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { getFilePreviewUrl } from "@/components/core/playgroundComponent/chat-view/utils/file-utils";
import { Button } from "@/components/ui/button";
import type { NodeDataType } from "@/types/flow";

interface ImageNodeInspectionProps {
  data: NodeDataType;
  onClose?: () => void;
}

export default function ImageNodeInspection({
  data,
  onClose,
}: ImageNodeInspectionProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const template = data.node?.template ?? {};
  const file_id = template.file_id?.value || data.node?.file_id;
  const file_path = template.image_path?.value || data.node?.file_path;
  const file_name = template.file_name?.value || data.node?.file_name;

  const previewUrl = useMemo(
    () => getFilePreviewUrl({ path: file_path ?? "", file_id }),
    [file_path, file_id],
  );

  if (!file_id && !file_path) {
    return (
      <div className="flex flex-col" data-testid="image-node-inspection">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <ForwardedIconComponent
              name="Image"
              className="h-4 w-4 shrink-0 text-muted-foreground"
            />
            <span className="truncate text-sm font-semibold">
              Image Node (empty)
            </span>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="iconSm"
              onClick={onClose}
              data-testid="close-inspection-panel"
            >
              <ForwardedIconComponent name="X" className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex h-[200px] w-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <ForwardedIconComponent name="ImageOff" className="h-10 w-10" />
          <span className="text-sm">No image data</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" data-testid="image-node-inspection">
      {/* Header with file name and close button */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <ForwardedIconComponent
            name="Image"
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
          <span className="truncate text-sm font-semibold">{file_name}</span>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onClose}
            data-testid="close-inspection-panel"
          >
            <ForwardedIconComponent name="X" className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Image preview area */}
      <div className="flex flex-col items-center justify-center p-4">
        <div className="flex w-full items-center justify-center overflow-hidden rounded-lg bg-muted/30">
          {previewUrl && !imageError ? (
            <>
              {!imageLoaded && (
                <div className="flex h-[250px] w-full items-center justify-center">
                  <ForwardedIconComponent
                    name="Loader2"
                    className="h-6 w-6 animate-spin text-muted-foreground"
                  />
                </div>
              )}
              <img
                src={previewUrl}
                alt={file_name}
                crossOrigin="use-credentials"
                onLoad={() => setImageLoaded(true)}
                onError={() => {
                  setImageError(true);
                  setImageLoaded(false);
                }}
                className={`max-h-[300px] w-full object-contain transition-opacity duration-200 ${
                  imageLoaded ? "opacity-100" : "absolute opacity-0"
                }`}
                style={!imageLoaded ? { position: "absolute" } : undefined}
              />
            </>
          ) : (
            <div className="flex h-[200px] w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ForwardedIconComponent name="ImageOff" className="h-10 w-10" />
              <span className="text-sm">
                {imageError
                  ? "Failed to load image preview"
                  : "No preview available"}
              </span>
              {imageError && (
                <span className="max-w-[280px] truncate text-xs text-muted-foreground/60">
                  {file_path}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* File details */}
      <div className="border-t px-4 py-3">
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Type</span>
            <span className="font-medium text-foreground">Image</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Path</span>
            <span
              className="max-w-[200px] truncate font-medium text-foreground"
              title={file_path}
            >
              {file_path}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
