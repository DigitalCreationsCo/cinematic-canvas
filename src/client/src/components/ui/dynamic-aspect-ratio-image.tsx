import { memo, useMemo } from "react";

export interface ImageDimensions {
  width?: number | null;
  height?: number | null;
}

interface DynamicAspectRatioImageProps {
  imageUrl?: string;
  metadata?: ImageDimensions;
  alt: string;
  defaultAspectRatio?: number;
  objectFit?: "contain" | "cover" | "fill";
  className?: string;
  priority?: boolean;
}

/**
 * Calculates aspect ratio from image metadata dimensions.
 * Falls back to default ratio if dimensions are not available.
 */
function calculateAspectRatio(
  metadata?: ImageDimensions,
  defaultRatio: number = 16 / 9
): number {
  if (metadata?.width && metadata?.height && metadata.width > 0 && metadata.height > 0) {
    return metadata.width / metadata.height;
  }
  return defaultRatio;
}

/**
 * Formats aspect ratio as CSS-compatible string (e.g., "16/9").
 */
function formatAspectRatio(ratio: number): string {
  // Simplify the ratio to common fractions for cleaner CSS
  const commonRatios: [number, string][] = [
    [1, "1/1"],       // Square
    [16 / 9, "16/9"], // Common video
    [4 / 3, "4/3"],   // Classic
    [21 / 9, "21/9"], // Ultrawide
    [3 / 2, "3/2"],   // Photo
    [9 / 16, "9/16"], // Portrait/Vertical
    [2 / 3, "2/3"],   // Portrait
    [1.91, "191/100"], // Social
  ];

  // Find closest common ratio
  for (const [r, css] of commonRatios) {
    if (Math.abs(ratio - r) < 0.05) {
      return css;
    }
  }

  // Fall back to exact ratio with 2 decimal places
  return `${ratio.toFixed(2)}/1`;
}

export const DynamicAspectRatioImage = memo(function DynamicAspectRatioImage({
  imageUrl,
  metadata,
  alt,
  defaultAspectRatio = 16 / 9,
  objectFit = "contain",
  className = "",
  priority = false,
}: DynamicAspectRatioImageProps) {
  const aspectRatio = useMemo(
    () => calculateAspectRatio(metadata, defaultAspectRatio),
    [metadata?.width, metadata?.height, defaultAspectRatio]
  );

  const aspectRatioCss = useMemo(
    () => formatAspectRatio(aspectRatio),
    [aspectRatio]
  );

  if (!imageUrl) {
    return (
      <div
        className={`bg-muted flex items-center justify-center ${className}`}
        style={{ aspectRatio: aspectRatioCss }}
      >
        <span className="text-muted-foreground text-sm">No image</span>
      </div>
    );
  }

  return (
    <div
      className={`bg-muted overflow-hidden ${className}`}
      style={{ aspectRatio: aspectRatioCss }}
    >
      <img
        src={imageUrl}
        alt={alt}
        className={`w-full h-full object-${objectFit}`}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
      />
    </div>
  );
});

export default DynamicAspectRatioImage;
