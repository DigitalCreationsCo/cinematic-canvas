import { useMemo, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { getFilePreviewUrl } from "@/components/core/playgroundComponent/chat-view/utils/file-utils";
import type { APIClassType } from "@/types/api";
import { cn } from "@/utils/utils";

export default function ImagePreviewField({
  value,
  nodeClass,
}: {
  value: any;
  nodeClass?: APIClassType;
}) {
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isImagePreviewLoaded, setIsImagePreviewLoaded] = useState(false);

  const actualValue = typeof value === "string" ? value : (value?.image ?? "");

  const extractedFileName = useMemo(() => {
    try {
      if (typeof value !== "string" && value?.file_name) {
        return value.file_name;
      }
      if (!actualValue || actualValue.trim().length === 0) {
        console.debug(
          "[ImagePreviewField] Trace: No value provided for filename extraction.",
        );
        return "Unknown File";
      }

      const pathSegments = actualValue.split("/");
      const rawFileName = pathSegments.pop() || "Unknown File";

      // Langflow typically prepends a Unix timestamp to uploaded files to prevent collisions.
      // We strip this prefix (e.g., "1691234567_image.png" -> "image.png") for a clean UI presentation.
      const cleanFileName = rawFileName.replace(/^\d+_/, "");

      return cleanFileName;
    } catch (error) {
      console.error(
        "[ImagePreviewField] Error extracting filename from path:",
        error,
        { providedValue: value },
      );
      return "Invalid Path";
    }
  }, [value, actualValue]);

  const previewUrl = useMemo(() => {
    try {
      if (!actualValue || actualValue.trim().length === 0) return null;
      // If the node carries a file_id (v2-uploaded files have multi-segment paths
      // incompatible with the v1 path-based endpoint), prefer the v2 by-id endpoint.
      const fileId = nodeClass?.template?.file_id?.value as string | undefined;
      return getFilePreviewUrl(
        fileId ? { path: actualValue, file_id: fileId } : { path: actualValue },
      );
    } catch (error) {
      console.error(
        "[ImagePreviewField] Error generating preview URL:",
        error,
        { providedValue: actualValue },
      );
      return null;
    }
  }, [actualValue, nodeClass]);

  if (!previewUrl) return null;

  return (
    <div className="flex w-full flex-col items-center justify-center overflow-hidden rounded-md bg-muted/20 p-2 border border-border/50">
      {!hasLoadError && !isImagePreviewLoaded && (
        <ForwardedIconComponent
          name="Loader2"
          className="h-5 w-5 animate-spin text-muted-foreground py-4"
        />
      )}

      <img
        src={previewUrl}
        alt={`Preview of ${extractedFileName}`}
        crossOrigin="use-credentials"
        onLoad={() => {
          console.debug(
            `[ImagePreviewField] Trace: Image successfully loaded for ${extractedFileName}`,
          );
          setIsImagePreviewLoaded(true);
        }}
        onError={(e) => {
          console.error(
            `[ImagePreviewField] Failed to load image at URL: ${previewUrl}`,
            e,
          );
          setHasLoadError(true);
        }}
        className={cn(
          "max-h-[160px] w-full object-contain",
          (!isImagePreviewLoaded || hasLoadError) && "hidden",
        )}
      />

      {hasLoadError && (
        <div className="flex flex-col items-center gap-1 text-muted-foreground py-4">
          <ForwardedIconComponent
            name="ImageOff"
            className="h-6 w-6 opacity-50"
          />
          <span className="text-[10px]">Preview unavailable</span>
        </div>
      )}

      {isImagePreviewLoaded && !hasLoadError && (
        <div
          className="mt-2 w-full truncate text-center text-xs font-medium text-muted-foreground"
          title={extractedFileName}
        >
          {extractedFileName}
        </div>
      )}
    </div>
  );
}
