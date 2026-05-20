/**
 * Targeted barrel for lucide-react.
 *
 * Replaces the full lucide-react barrel (which re-exports all 3,872 icons
 * and causes Rollup to resolve every one of them). This file re-exports
 * only the icons actually used by the application.
 *
 * If you need an icon not listed here, add it in the same pattern:
 *   export { default as YourIcon } from "lucide-react/dist/esm/icons/your-icon.js";
 *
 * Not having an icon here will not crash the build — it simply won't be
 * available via `import { IconName } from "lucide-react"`.
 */

export { default as AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle.js";
export { default as ArrowRight } from "lucide-react/dist/esm/icons/arrow-right.js";
export {
  default as Check,
  default as CheckIcon,
} from "lucide-react/dist/esm/icons/check.js";
export { default as ChevronDown } from "lucide-react/dist/esm/icons/chevron-down.js";
export {
  default as ChevronRight,
  default as ChevronRightIcon,
} from "lucide-react/dist/esm/icons/chevron-right.js";
export { default as ChevronUp } from "lucide-react/dist/esm/icons/chevron-up.js";
export { default as ChevronsUpDown } from "lucide-react/dist/esm/icons/chevrons-up-down.js";
export { default as CircleIcon } from "lucide-react/dist/esm/icons/circle.js";
export { default as Code2 } from "lucide-react/dist/esm/icons/code-2.js";
export { default as ExternalLink } from "lucide-react/dist/esm/icons/external-link.js";
export { default as Eye } from "lucide-react/dist/esm/icons/eye.js";
export { default as EyeOff } from "lucide-react/dist/esm/icons/eye-off.js";
export { default as FileText } from "lucide-react/dist/esm/icons/file-text.js";
export { default as Loader2 } from "lucide-react/dist/esm/icons/loader-2.js";
export { default as MinusIcon } from "lucide-react/dist/esm/icons/minus.js";
export { default as PanelLeft } from "lucide-react/dist/esm/icons/panel-left.js";
export { default as Play } from "lucide-react/dist/esm/icons/play.js";
export { default as PlusIcon } from "lucide-react/dist/esm/icons/plus.js";
export { default as Square } from "lucide-react/dist/esm/icons/square.js";
export { default as X } from "lucide-react/dist/esm/icons/x.js";
export { default as XCircle } from "lucide-react/dist/esm/icons/x-circle.js";

/* Note: `LucideProps` type is available from `lucide-react` in node_modules (for tsc). */
