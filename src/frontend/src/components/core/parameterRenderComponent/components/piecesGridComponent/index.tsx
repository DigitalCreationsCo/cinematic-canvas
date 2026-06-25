import { useCallback, useEffect, useRef, useState } from "react";
import { getFilePreviewUrl } from "@/components/core/playgroundComponent/chat-view/utils/file-utils";
import { Input } from "@/components/ui/input";
import useFlowStore from "@/stores/flowStore";
import type { InputProps } from "../../types";

/**
 * Extract a human-readable filename from an image path/URL.
 *
 * Handles:
 *   - storage paths:  "flow_id/1691234567_tshirt.png" → "tshirt"
 *   - URLs:           "https://example.com/images/pants.jpg" → "pants"
 *   - data URLs:      "data:image/png;base64,..." → null (no meaningful name)
 *   - blob URLs:      "blob:..." → null (transient)
 */
function extractFilename(image: string | null): string | null {
  if (!image) return null;
  // data: and blob: URLs have no meaningful filename
  if (image.startsWith("data:") || image.startsWith("blob:")) return null;
  // Extract final path segment
  const pathSegments = image.split("/");
  const rawFileName = pathSegments.pop();
  if (!rawFileName) return null;
  // Strip Langflow's timestamp prefix (e.g. "1691234567_image.png" → "image.png")
  const cleanFileName = rawFileName.replace(/^\d+_/, "");
  // Remove file extension
  return cleanFileName.replace(/\.[^/.]+$/, "");
}

/** Shape of a single piece derived from connected edges. */
interface PieceData {
  type: string;
  name: string;
  image: string | null;
  file_id: string | null;
  filename: string | null;
}

/**
 * Resolve a piece image to a displayable URL.
 */
function useResolveImageUrl(): (piece: {
  image: string | null;
  file_id: string | null;
}) => string | null {
  return useCallback(
    (piece: {
      image: string | null;
      file_id: string | null;
    }): string | null => {
      if (!piece.image) return null;
      if (
        piece.image.startsWith("http") ||
        piece.image.startsWith("data:") ||
        piece.image.startsWith("blob:")
      ) {
        return piece.image;
      }
      return getFilePreviewUrl({
        path: piece.image,
        file_id: piece.file_id ?? undefined,
        type: "image",
      });
    },
    [],
  );
}

// ── Individual Piece Row (owns its own input state) ────────────────────

interface PieceRowProps {
  piece: PieceData;
  override: string | undefined;
  disabled?: boolean;
  onBlur: (pieceName: string, newCaption: string) => void;
}

function PieceRow({ piece, override, disabled, onBlur }: PieceRowProps) {
  const [localText, setLocalText] = useState(() => {
    // Initialize from the override value or fall back to filename / name
    return override ?? piece.filename ?? piece.name;
  });

  // Sync local state when the override changes *externally*
  // (e.g. a new piece is auto-initialized by the parent effect).
  const prevOverrideRef = useRef(override);

  useEffect(() => {
    // Only sync when the override actually changed to something different
    // than what the user is currently typing — avoid clobbering active edits.
    if (override !== prevOverrideRef.current) {
      if (override !== undefined) {
        setLocalText(override);
      }
      prevOverrideRef.current = override;
    }
  }, [override]);

  const resolveImageUrl = useResolveImageUrl();
  const imgUrl = resolveImageUrl(piece);

  return (
    <div className="flex flex-col gap-2 border p-3 rounded-md bg-background">
      <div className="flex items-start gap-4">
        {/* Image preview — 96x96 thumbnail */}
        <div className="w-24 h-24 shrink-0 bg-muted rounded-md overflow-hidden flex items-center justify-center">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={piece.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs text-muted-foreground px-1 text-center">
              No image
            </span>
          )}
        </div>
        {/* Piece name + editable caption input */}
        <div className="flex-1 flex flex-col gap-2 overflow-hidden">
          <div className="text-sm font-medium truncate" title={piece.name}>
            {piece.name || "Unnamed piece"}
          </div>
          <div className="flex flex-col gap-1 mt-1">
            <span className="text-xs text-muted-foreground">Caption</span>
            <Input
              value={localText}
              onChange={(e) => setLocalText(e.target.value)}
              onBlur={() => onBlur(piece.name, localText)}
              disabled={disabled}
              placeholder="Enter image caption..."
              className="h-8"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export default function PiecesGridComponent({
  value = {},
  handleOnNewValue,
  disabled,
  editNode = false,
  id,
  nodeId,
  mode = "captions",
}: InputProps<any> & { mode?: "grid" | "captions" }): JSX.Element | null {
  const edges = useFlowStore((state) => state.edges);
  const nodes = useFlowStore((state) => state.nodes);

  // Get current caption overrides
  const overrides =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? value
      : {};

  // Get connected pieces from edges
  const allPieces: PieceData[] = edges
    .filter((e) => e.target === nodeId && e.targetHandle?.includes("pieces"))
    .map((edge) => {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) return null;

      if (sourceNode.type === "genericNode") {
        const nodeData = sourceNode.data?.node as any;
        const template = nodeData?.template || {};

        let image = null;
        let fileId = null;
        for (const key of Object.keys(template)) {
          if (key === "file_id" && template[key]?.value) {
            fileId = template[key].value;
          }
          if (
            !image &&
            (template[key]?.type === "file" ||
              template[key]?.type === "image" ||
              key.includes("image") ||
              key === "file_path")
          ) {
            image = template[key]?.value;
          }
        }

        const name = nodeData?.display_name || "Node";
        return {
          type: name.toLowerCase().includes("image") ? "image" : "prop",
          name: name,
          image: image,
          file_id: fileId,
          filename: extractFilename(image),
        };
      }
      return null;
    })
    .filter(Boolean) as any[];

  // ── Auto-initialize overrides from filenames ──────────────────────────
  // When pieces are first connected (or new ones appear), pre-populate each
  // piece's caption with the filename extracted from its image path.
  const initializedRef = useRef(false);
  const prevPieceCount = useRef(0);

  useEffect(() => {
    if (allPieces.length === 0) {
      initializedRef.current = false;
      prevPieceCount.current = 0;
      return;
    }

    const hasNewPieces = allPieces.length > prevPieceCount.current;
    if (!initializedRef.current || hasNewPieces) {
      const newOverrides = { ...overrides };
      let changed = false;

      for (const piece of allPieces) {
        const alreadySet =
          piece.name in newOverrides && newOverrides[piece.name] !== "";
        if (!alreadySet) {
          const initialCaption = piece.filename || piece.name;
          if (newOverrides[piece.name] !== initialCaption) {
            newOverrides[piece.name] = initialCaption;
            changed = true;
          }
        }
      }

      if (changed) {
        handleOnNewValue({ value: newOverrides });
      }
      initializedRef.current = true;
      prevPieceCount.current = allPieces.length;
    }
  }, [allPieces.length, overrides, handleOnNewValue]);

  // ── Blur handler: propagate local caption to parent state ────────────

  const handleCaptionBlur = useCallback(
    (pieceName: string, newCaption: string) => {
      const currentOverride = overrides[pieceName];
      // Only update if the value actually changed
      if (currentOverride === newCaption) return;

      const newOverrides = { ...overrides };
      if (newCaption) {
        newOverrides[pieceName] = newCaption;
      } else {
        delete newOverrides[pieceName];
      }
      handleOnNewValue({ value: newOverrides });
    },
    [overrides, handleOnNewValue],
  );

  // ── Helper: resolve piece image to displayable URL ───────────────────

  const resolveImageUrl = useResolveImageUrl();

  // ── Grid mode: image thumbnails (node canvas view) ──────────────────

  if (mode === "grid") {
    if (editNode) return null;

    return (
      <div className="grid grid-cols-2 gap-2 w-full p-2" id={id}>
        {allPieces.map((piece, i) => {
          const imgUrl = resolveImageUrl(piece);
          return (
            <div
              key={piece.name}
              className="aspect-square bg-muted rounded-md overflow-hidden flex items-center justify-center"
            >
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt={piece.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground px-1 text-center truncate w-full">
                  {piece.name || "No image"}
                </span>
              )}
            </div>
          );
        })}
        {allPieces.length === 0 && (
          <div className="col-span-2 text-center text-xs text-muted-foreground py-2">
            No pieces attached
          </div>
        )}
      </div>
    );
  }

  // ── Captions mode: image preview + editable caption per piece ───────

  if (mode === "captions") {
    const hasNoPieces = allPieces.length === 0;

    return (
      <div className="flex flex-col gap-4 w-full pt-2" id={id}>
        {allPieces.map((piece) => (
          <PieceRow
            key={piece.name}
            piece={piece}
            override={overrides[piece.name]}
            disabled={disabled}
            onBlur={handleCaptionBlur}
          />
        ))}
        {hasNoPieces && (
          <div className="text-center text-sm text-muted-foreground py-4">
            No pieces attached
          </div>
        )}
      </div>
    );
  }

  return null;
}
