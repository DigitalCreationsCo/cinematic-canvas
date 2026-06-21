import { Handle, Position } from "@xyflow/react";
import { useMemo, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { getFilePreviewUrl } from "@/components/core/playgroundComponent/chat-view/utils/file-utils";
import type { ImageNodeDataType } from "@/types/flow";
import { nodeColors } from "@/utils/styleUtils";
import { cn } from "@/utils/utils";

const IMAGE_OUTPUT_HANDLE_ID = JSON.stringify({
  output_types: ["Data"],
  name: "image_output",
});

const HANDLE_COLOR = nodeColors["Data"] ?? "#dc2626";

function ImageNode({
  data,
  selected,
}: {
  data: ImageNodeDataType;
  selected?: boolean;
}) {
  const [imageError, setImageError] = useState(false);
  const { file_path, file_name } = data.node;

  const previewUrl = useMemo(
    () => getFilePreviewUrl({ path: file_path }),
    [file_path],
  );

  return (
    <div
      data-testid="image_node"
      className={cn(
        "relative flex w-[200px] flex-col gap-1.5 rounded-xl border shadow-sm",
        "bg-background",
        selected
          ? "border-foreground/30 shadow-md"
          : "border-border hover:shadow-md",
      )}
    >
      {/* Image preview */}
      <div className="flex items-center justify-center overflow-hidden rounded-t-xl bg-muted/30">
        {previewUrl && !imageError ? (
          <img
            src={previewUrl}
            alt={file_name}
            crossOrigin="use-credentials"
            onError={() => setImageError(true)}
            className="max-h-[140px] w-full object-contain"
          />
        ) : (
          <div className="flex h-[100px] w-full items-center justify-center">
            <ForwardedIconComponent
              name="Image"
              className="h-10 w-10 text-muted-foreground"
            />
          </div>
        )}
      </div>

      {/* File name label */}
      <div className="flex items-center gap-1.5 px-2.5 pb-2 text-xs">
        <ForwardedIconComponent
          name="Image"
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        />
        <span className="truncate font-medium">{file_name}</span>
      </div>

      {/* Source output handle (Data type) */}
      <Handle
        type="source"
        position={Position.Right}
        id={IMAGE_OUTPUT_HANDLE_ID}
        className="!h-3 !w-3 !rounded-full !border-2 !border-background"
        style={{ background: HANDLE_COLOR }}
      />
    </div>
  );
}

export default ImageNode;
