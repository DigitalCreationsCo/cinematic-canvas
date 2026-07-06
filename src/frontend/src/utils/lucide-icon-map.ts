import { lazy } from "react";

/**
 * Targeted map of lucide icon names to lazy-loaded components.
 *
 * This replaces the import of `lucide-react/dynamicIconImports` which
 * creates 3,872 separate Rollup chunks — one for every lucide icon.
 * That caused an OOM during production builds (the build needed ~6GB
 * heap to track 1,866 chunks across 12,587 modules).
 *
 * By importing only the ~42 icons the app actually uses, we reduce
 * chunk count by ~1,600 and keep peak memory well under 2 GB.
 *
 * If you need icons not listed here, add them in kebab-case.
 */

// Lucide icon modules return React SVG components
type LucideIconModule = Promise<{
  default: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}>;

const iconModules: Record<string, () => LucideIconModule> = {
  activity: () => import("lucide-react/dist/esm/icons/activity.js"),
  "arrow-right-left": () =>
    import("lucide-react/dist/esm/icons/arrow-right-left.js"),
  "arrow-up-right": () =>
    import("lucide-react/dist/esm/icons/arrow-up-right.js"),
  bell: () => import("lucide-react/dist/esm/icons/bell.js"),
  binary: () => import("lucide-react/dist/esm/icons/binary.js"),
  blocks: () => import("lucide-react/dist/esm/icons/blocks.js"),
  bot: () => import("lucide-react/dist/esm/icons/bot.js"),
  braces: () => import("lucide-react/dist/esm/icons/braces.js"),
  "brain-circuit": () => import("lucide-react/dist/esm/icons/brain-circuit.js"),
  "brain-cog": () => import("lucide-react/dist/esm/icons/brain-cog.js"),
  cable: () => import("lucide-react/dist/esm/icons/cable.js"),
  "chevron-right": () => import("lucide-react/dist/esm/icons/chevron-right.js"),
  "chevrons-up-down": () =>
    import("lucide-react/dist/esm/icons/chevrons-up-down.js"),
  "circle-alert": () => import("lucide-react/dist/esm/icons/circle-alert.js"),
  compass: () => import("lucide-react/dist/esm/icons/compass.js"),
  component: () => import("lucide-react/dist/esm/icons/component.js"),
  cpu: () => import("lucide-react/dist/esm/icons/cpu.js"),
  database: () => import("lucide-react/dist/esm/icons/database.js"),
  download: () => import("lucide-react/dist/esm/icons/download.js"),
  edit: () => import("lucide-react/dist/esm/icons/edit.js"),
  "ellipsis-vertical": () =>
    import("lucide-react/dist/esm/icons/ellipsis-vertical.js"),
  file: () => import("lucide-react/dist/esm/icons/file.js"),
  "file-clock": () => import("lucide-react/dist/esm/icons/file-clock.js"),
  "file-search": () => import("lucide-react/dist/esm/icons/file-search.js"),
  "file-sliders": () => import("lucide-react/dist/esm/icons/file-sliders.js"),
  "flask-conical": () => import("lucide-react/dist/esm/icons/flask-conical.js"),
  gift: () => import("lucide-react/dist/esm/icons/gift.js"),
  globe: () => import("lucide-react/dist/esm/icons/globe.js"),
  "grip-vertical": () => import("lucide-react/dist/esm/icons/grip-vertical.js"),
  group: () => import("lucide-react/dist/esm/icons/group.js"),
  "hard-drive": () => import("lucide-react/dist/esm/icons/hard-drive.js"),
  hammer: () => import("lucide-react/dist/esm/icons/hammer.js"),
  "help-circle": () => import("lucide-react/dist/esm/icons/help-circle.js"),
  history: () => import("lucide-react/dist/esm/icons/history.js"),
  "laptop-2": () => import("lucide-react/dist/esm/icons/laptop-2.js"),
  layers: () => import("lucide-react/dist/esm/icons/layers.js"),
  link: () => import("lucide-react/dist/esm/icons/link.js"),
  "link-2": () => import("lucide-react/dist/esm/icons/link-2.js"),
  "list-filter": () => import("lucide-react/dist/esm/icons/list-filter.js"),
  "loader-2": () => import("lucide-react/dist/esm/icons/loader-2.js"),
  "message-circle": () =>
    import("lucide-react/dist/esm/icons/message-circle.js"),
  "messages-square": () =>
    import("lucide-react/dist/esm/icons/messages-square.js"),
  "package-2": () => import("lucide-react/dist/esm/icons/package-2.js"),
  "panel-left-close": () =>
    import("lucide-react/dist/esm/icons/panel-left-close.js"),
  paperclip: () => import("lucide-react/dist/esm/icons/paperclip.js"),
  plus: () => import("lucide-react/dist/esm/icons/plus.js"),
  "pocket-knife": () => import("lucide-react/dist/esm/icons/pocket-knife.js"),
  scissors: () => import("lucide-react/dist/esm/icons/scissors.js"),
  search: () => import("lucide-react/dist/esm/icons/search.js"),
  "settings-2": () => import("lucide-react/dist/esm/icons/settings-2.js"),
  "sliders-horizontal": () =>
    import("lucide-react/dist/esm/icons/sliders-horizontal.js"),
  "square-terminal": () =>
    import("lucide-react/dist/esm/icons/square-terminal.js"),
  "sticky-note": () => import("lucide-react/dist/esm/icons/sticky-note.js"),
  "text-search": () => import("lucide-react/dist/esm/icons/text-search.js"),
  "trash-2": () => import("lucide-react/dist/esm/icons/trash-2.js"),
  "trending-up": () => import("lucide-react/dist/esm/icons/trending-up.js"),
  "triangle-alert": () =>
    import("lucide-react/dist/esm/icons/triangle-alert.js"),
  upload: () => import("lucide-react/dist/esm/icons/upload.js"),
  "wand-sparkles": () => import("lucide-react/dist/esm/icons/wand-sparkles.js"),
  x: () => import("lucide-react/dist/esm/icons/x.js"),
  zap: () => import("lucide-react/dist/esm/icons/zap.js"),
};

/** Tell whether a kebab-case lucide icon name exists in our map. */
export function lucideIconExists(name: string): boolean {
  return name in iconModules;
}

/** Build a React.lazy wrapper for the icon, or null if missing. */
export function getLucideIconLazy(
  name: string,
): React.LazyExoticComponent<
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> | null {
  const importer = iconModules[name];
  if (!importer) return null;
  return lazy(importer);
}
