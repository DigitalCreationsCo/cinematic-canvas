import { useMemo, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import {
  getFilePreviewUrl,
  isAbsoluteUrl,
} from "@/components/core/playgroundComponent/chat-view/utils/file-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import useFlowStore from "@/stores/flowStore";
import type { NodeDataType } from "@/types/flow";
import { cn } from "@/utils/utils";

interface GroupNodeInspectionProps {
  data: NodeDataType;
  onClose?: () => void;
}

interface PieceData {
  name: string;
  description?: string;
  caption?: string;
  inherited_description?: string;
  type: "image" | "prop";
  image?: string | null;
  file_id?: string | null;
}

/**
 * Resolve a piece's image to a displayable URL.
 * Handles data: URLs, http/https URLs, and file storage paths.
 * When a file_id is available, uses the v2 by-ID image-serving endpoint
 * which correctly handles v2 multi-segment storage paths.
 */
function resolvePieceImage(
  piece: PieceData,
  fileId?: string | null,
): string | null {
  if (!piece.image) return null;

  // Already a data URL or absolute URL
  if (isAbsoluteUrl(piece.image)) {
    return piece.image;
  }

  // Storage path — use file preview utility, passing file_id when available
  try {
    return getFilePreviewUrl({
      path: piece.image,
      file_id: fileId ?? piece.file_id ?? undefined,
      type: "image",
    });
  } catch {
    return null;
  }
}

export default function GroupNodeInspection({
  data,
  onClose,
}: GroupNodeInspectionProps) {
  const nodeId = data.id;
  const flowPool = useFlowStore((state) => state.flowPool);
  const edges = useFlowStore((state) => state.edges);
  const nodes = useFlowStore((state) => state.nodes);
  const [captions, setCaptions] = useState<Record<string, string>>({});

  // Extract file_ids from connected source node templates
  const fileIdByPieceName = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const edge of edges) {
      if (edge.target !== nodeId) continue;
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (sourceNode?.type !== "genericNode") continue;
      const template = (sourceNode.data?.node as any)?.template ?? {};
      const fileId = template["file_id"]?.value;
      const displayName = (sourceNode.data?.node as any)?.display_name;
      if (displayName && fileId) {
        map[displayName] = fileId;
      }
    }
    console.log("DEBUG: fileIdByPieceName", map);
    return map;
  }, [edges, nodes, nodeId]);

  // Extract pieces from the latest build output for the group_data output
  const pieces: PieceData[] = useMemo(() => {
    const pool = flowPool[nodeId] ?? [];
    const latest = pool[pool.length - 1];
    if (!latest) return [];

    const rawOutput = latest.data?.outputs?.["group_data"];
    if (!rawOutput) return [];

    // OutputLogType can be an array or a single object
    const messages = Array.isArray(rawOutput) ? rawOutput : [rawOutput];
    const firstMessage = messages[0]?.message;
    if (!firstMessage) return [];

    // The data field might be nested under `.data` or directly on the message
    const payload = firstMessage.data ?? firstMessage;
    const rawPieces: unknown[] = payload?.pieces ?? [];
    console.log("DEBUG: rawPieces", rawPieces);

    return rawPieces.filter(
      (p): p is PieceData =>
        p != null && typeof p === "object" && "name" in p && "type" in p,
    );
  }, [flowPool, nodeId]);

  // Initialise captions from filename on first load
  useMemo(() => {
    if (pieces.length > 0 && Object.keys(captions).length === 0) {
      const initial: Record<string, string> = {};
      for (const p of pieces) {
        // Derive caption: use existing caption, or filename from image path
        let caption = p.caption ?? "";
        if (!caption && p.image) {
          // Extract filename from path/URL
          caption = p.image.split("/").pop()?.split(".")[0] ?? p.name;
        }
        initial[p.name] = caption || p.name;
      }
      setCaptions(initial);
    }
  }, [pieces]); // eslint-disable-line react-hooks/exhaustive-deps

  const isGroup = data.node?.display_name === "Group";

  // Only render for Group components
  if (!isGroup) {
    return (
      <div className="flex flex-col" data-testid="group-node-inspection">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <ForwardedIconComponent
              name="BoxSelect"
              className="h-4 w-4 shrink-0 text-muted-foreground"
            />
            <span className="truncate text-sm font-semibold">
              {data.node?.display_name ?? "Group"}
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
          <ForwardedIconComponent name="BoxSelect" className="h-10 w-10" />
          <span className="text-sm">No group data available</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" data-testid="group-node-inspection">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <ForwardedIconComponent
            name="BoxSelect"
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
          <span className="truncate text-sm font-semibold">
            {data.node?.display_name ?? "Group"} Pieces
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

      {/* Pieces grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {pieces.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <ForwardedIconComponent name="ImageOff" className="h-10 w-10" />
            <span className="text-sm">
              Run the Group component to generate pieces
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {pieces.map((piece) => {
              const imgUrl = resolvePieceImage(
                piece,
                fileIdByPieceName[piece.name],
              );
              const caption =
                captions[piece.name] ?? piece.caption ?? piece.name;

              return (
                <div
                  key={piece.name}
                  className="group/caption flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-2"
                >
                  {/* Image */}
                  <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-muted/40">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={piece.name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          const parent = (e.target as HTMLImageElement)
                            .parentElement;
                          if (parent) {
                            const fallback = parent.querySelector(
                              ".piece-fallback-icon",
                            ) as HTMLElement | null;
                            if (fallback) fallback.style.display = "flex";
                          }
                        }}
                      />
                    ) : null}
                    <div
                      className="piece-fallback-icon hidden h-full w-full items-center justify-center"
                      style={{ display: imgUrl ? "none" : "flex" }}
                    >
                      <ForwardedIconComponent
                        name={piece.type === "prop" ? "Box" : "ImageOff"}
                        className="h-6 w-6 text-muted-foreground/50"
                      />
                    </div>
                  </div>

                  {/* Piece type badge */}
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                        piece.type === "image"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                      )}
                    >
                      {piece.type}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {piece.name}
                    </span>
                  </div>

                  {/* Editable caption */}
                  <Input
                    value={caption}
                    onChange={(e) =>
                      setCaptions((prev) => ({
                        ...prev,
                        [piece.name]: e.target.value,
                      }))
                    }
                    placeholder="Add caption..."
                    className="h-7 text-xs"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
