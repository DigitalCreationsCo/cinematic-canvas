import { Card, CardContent } from "#/components/ui/card.js";
import { Badge } from "#/components/ui/badge.js";
import { MapPin, Sun, Cloud } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.js";
import type { Location } from "../../../shared/types/index.js";
import { Skeleton } from "#/components/ui/skeleton.js"; // Import Skeleton
import { memo } from "react";
import { useLocationAssets } from "#/lib/store.js";
import { resolvePublicUrl } from "../../../shared/utils/utils.js";

interface LocationCardProps {
  location: Location;
  onSelect?: (id: string) => void;
  isLoading?: boolean; // Added isLoading prop
  priority?: boolean;
  isSelected?: boolean;
}

const LocationCard = memo(function LocationCard({
  location,
  onSelect,
  isLoading = false,
  priority = false,
  isSelected = false
}: LocationCardProps) {
  const { bestAssets: assets } = useLocationAssets(location.id);
  const referenceImage = resolvePublicUrl(assets[ 'location_image' ]?.data);

  return (
    <Tooltip key={ location.id }>
      <TooltipTrigger asChild>
        <Card
          className={ `cursor-pointer hover-elevate overflow-hidden ${isSelected ? " " : ""}` }
          onClick={ () => onSelect?.(location.id) }
          data-testid={ `card-location-${location.id}` }
        >
          <div className="relative aspect-video bg-muted">
            { isLoading ? (
              <Skeleton className="w-full h-full" />
            ) : referenceImage ? (
              <img
                src={ referenceImage }
                alt={ location.name }
                className="w-full h-full object-cover"
                loading={ priority ? "eager" : "lazy" }
                decoding="async"
                fetchPriority={ priority ? "high" : "auto" }
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <MapPin className="w-8 h-8 text-muted-foreground/50" />
              </div>
            ) }
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-2 left-2 right-2">
              <h4 className=" font-medium text-white truncate">
                { isLoading ? <Skeleton className="h-4 w-3/4" /> : location.name }
              </h4>
            </div>
            <Badge className="absolute top-2 right-2  font-mono bg-black/50 text-white ">
              { isLoading ? <Skeleton className="h-3 w-4" /> : location.id }
            </Badge>
          </div>

          <CardContent className="p-3 space-y-2">
            <p className=" text-muted-foreground line-clamp-2">
              { isLoading ? <Skeleton className="h-4 w-full mb-1" /> : assets[ 'location_description' ]?.data }
            </p>

            <div className="flex items-center gap-3  text-muted-foreground">
              <div className="flex items-center gap-1">
                <Sun className="w-3 h-3" />
                <span className="truncate">
                  { isLoading ? <Skeleton className="h-3 w-16" /> : location.lightingConditions.quality.hardness }
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Cloud className="w-3 h-3" />
                <span>{ isLoading ? <Skeleton className="h-3 w-12" /> : location.timeOfDay }</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </TooltipTrigger>
      <TooltipContent side="right">View Details</TooltipContent>
    </Tooltip>
  );
});

export default LocationCard;
