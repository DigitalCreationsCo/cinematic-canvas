import { Button } from "#client/components/ui/button.js";
import { Moon, Sun } from "lucide-react";
import { useCanvasUIStore } from "../store/useCanvasUIStore.js";
import { useCallback, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#client/components/ui/tooltip.js";

export const ThemeButton = () => {
  const isDark = useCanvasUIStore((s) => s.isDark);
  const setIsDark = useCanvasUIStore((s) => s.setIsDark);

  const handleToggleTheme = useCallback(() => setIsDark(!isDark), [isDark, setIsDark]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 px-6"
          onClick={handleToggleTheme}
          data-testid="button-theme"
        >
          <Sun className="w-3.5 h-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isDark ? "Use Light Theme" : "Use Dark Theme"}</TooltipContent>
    </Tooltip>
  );
};
