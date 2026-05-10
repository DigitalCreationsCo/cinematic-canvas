// src/client/src/components/canvas/nodes/FormNode.tsx
//
// A base React Flow node component that wraps NodeShell and provides:
//   - Managed form state (fields, errors, isSubmitting)
//   - Validation on submit / after first submit attempt (same pattern as NewEntityModal)
//   - Render-prop pattern for injecting custom form fields
//   - Submit / Cancel action buttons in the footer
//
// USAGE:
//
//   Register with a custom type key in nodeTypes:
//     import { FormNode } from './FormNode.js';
//     export const nodeTypes: NodeTypes = {
//       ...existingTypes,
//       'entity-form': FormNode,
//     };
//
//   Create a node with formConfig in data:
//     const node = {
//       id: 'form-1',
//       type: 'entity-form',
//       position: { x: 0, y: 0 },
//       data: {
//         entityId: 'form-1',
//         contextId: projectId,
//         contextType: 'project',
//         scope: 'project',
//         formConfig: {
//           label: 'New Character',
//           icon: <User className="w-4 h-4" />,
//           renderFields: ({ fields, errors, hasAttemptedSubmit, requiredFields,
//                           onFieldChange, onFieldsChange }) => (
//             <>
//               <div className="grid gap-2">
//                 <EntityFieldLabel errors={errors} fieldPath="name"
//                   requiredFields={requiredFields}>Name</EntityFieldLabel>
//                 <Input className="nodrag" value={fields.name as string || ''}
//                   onChange={e => onFieldChange('name', e.target.value)}
//                   aria-invalid={Boolean(errors.name)} />
//                 <EntityFieldErrorMessage errors={errors} fieldPath="name" />
//               </div>
//             </>
//           ),
//           validate: (fields) => {
//             const errors: FormErrors = {};
//             if (!fields.name) errors.name = 'Name is required';
//             return errors;
//           },
//           onSubmit: async (fields) => { /* save */ },
//           requiredFields: ['name'],
//         },
//       },
//     };
//
// NOTE: Interactive elements inside the form (Input, Select, Textarea, etc.)
// MUST have `className="nodrag"` so they don't interfere with canvas drag.

import { useCallback, useMemo, useState, type ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";
import { Button } from "#client/components/ui/button.js";
import { cn } from "#client/lib/utils.js";
import { NodeShell, NodeShellHeader, type NodeHandleConfig } from "./NodeShell.js";
import type { CanvasNode } from "#client/domain/canvas/NodeTypes.js";

// ============================================================================
// TYPES
// ============================================================================

/** Errors keyed by dot-separated field path (same shape as EntityFormErrors). */
export type FormErrors = Partial<Record<string, string>>;

/** Props passed to the renderFields render prop. */
export interface FormFieldRendererProps<
  TFields extends Record<string, unknown> = Record<string, unknown>,
> {
  /** The entityId of the node this form belongs to. */
  entityId: string;
  /** Current field values. */
  fields: TFields;
  /** Current validation errors keyed by field path. */
  errors: FormErrors;
  /** Whether the user has attempted to submit at least once. */
  hasAttemptedSubmit: boolean;
  /** List of field paths considered required (for visual indicators). */
  requiredFields: readonly string[];
  /** Update a single field by dot-separated path. */
  onFieldChange: (path: string, value: unknown) => void;
  /** Replace all fields at once (e.g. after AI autofill). */
  onFieldsChange: (fields: TFields) => void;
}

/** Configuration passed via `data.formConfig` on the canvas node. */
export interface FormNodeConfig {
  /** Title shown in the NodeShell header. */
  label: string;
  /** Optional icon rendered next to the label. */
  icon?: React.ReactNode;

  // ── Handle configuration (passed through to NodeShell) ─────────────────
  targetHandle?: NodeHandleConfig;
  sourceHandle?: NodeHandleConfig;
  additionalTargetHandles?: NodeHandleConfig[];

  /**
   * Render prop that receives form state and returns field JSX.
   *
   * IMPORTANT: All interactive elements (Input, Select, Textarea, buttons)
   * MUST include `className="nodrag"` to prevent React Flow from intercepting
   * pointer events for canvas dragging.
   */
  renderFields: (props: FormFieldRendererProps) => React.ReactNode;

  /**
   * Validation function. Receives current field values and returns an
   * errors object keyed by field path. Return an empty object `{}` to
   * signal valid state.
   *
   * Validation runs:
   *   1. On every field change AFTER the first submit attempt.
   *   2. On submit (before calling onSubmit).
   */
  validate?: (fields: Record<string, unknown>) => FormErrors;

  /** Field paths considered required (display a red asterisk via EntityFieldLabel). */
  requiredFields?: readonly string[];

  /** Called when the form passes validation. */
  onSubmit?: (fields: Record<string, unknown>) => Promise<void>;

  /** Called when the user clicks Cancel. */
  onCancel?: () => void;

  /** Label for the submit button (default: "Submit"). */
  submitLabel?: string;
  /** Label for the cancel button (default: "Cancel"). */
  cancelLabel?: string;

  /** Extra classNames applied to the NodeShell wrapper. */
  className?: string;
  /** Extra classNames on the form-fields content area. */
  formClassName?: string;

  /** Toggle header visibility (default: true). */
  showHeader?: boolean;
  /** Toggle action button bar visibility (default: true). */
  showActions?: boolean;

  /**
   * When true, validation runs ONLY on submit, never on field change.
   * (default: false — validates on change after first submit attempt, same as
   * NewEntityModal).
   */
  validateOnlyOnSubmit?: boolean;

  /**
   * When true, the submit button is disabled unless at least one field
   * has a non-empty value. (default: true).
   */
  requireAtLeastOneValue?: boolean;

  /** Initial field values loaded into local state on mount. */
  initialValues?: Record<string, unknown>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EMPTY_REQUIRED_FIELDS: readonly string[] = [];
const EMPTY_RECORD: Record<string, unknown> = {};

// ============================================================================
// UTILITY — nested field update (mirrors updateField from EntityFormFields)
// ============================================================================

/**
 * Deep-update a value at a dot-separated path within an object, returning a
 * new object (immutable). Handles nested paths like "physicalTraits.hair".
 *
 * If `value` is an empty string it's stored as `undefined` (consistent with
 * the existing entity-form convention).
 */
export function updateField<T extends Record<string, unknown>>(
  current: T,
  path: string,
  value: unknown,
): T {
  const keys = path.split(".");
  const result = { ...current };
  let obj = result as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof obj[key] !== "object" || obj[key] === null) {
      obj[key] = {};
    }
    obj[key] = { ...(obj[key] as Record<string, unknown>) };
    obj = obj[key] as Record<string, unknown>;
  }

  obj[keys[keys.length - 1]] = typeof value === "string" && value === "" ? undefined : value;
  return result;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FormNode({
  data,
  selected,
  isConnectable,
}: NodeProps<CanvasNode>) {
  // ── Extract config from node data ─────────────────────────────────────
  // The consumer places a FormNodeConfig object on data.formConfig.
  const config = data.formConfig as FormNodeConfig | undefined;

  // ── Early exit: render a placeholder when no config is set ─────────────
  // This guard must come before destructuring so TypeScript narrows config
  // to a defined FormNodeConfig for the rest of the hook body.
  if (!config) {
    return (
      <NodeShell
        id={data.entityId}
        data={data}
        selected={selected}
        isConnectable={isConnectable}
        className="w-64"
      >
        <NodeShellHeader
          label="FormNode (no config)"
          pendingCount={data.pendingChangeCount ?? 0}
        />
        <div className="p-4 text-xs text-muted-foreground text-center">
          Pass a <code>formConfig</code> on <code>data</code> to configure this node.
        </div>
      </NodeShell>
    );
  }

  const {
    label = "Form",
    icon,
    targetHandle,
    sourceHandle,
    additionalTargetHandles,
    renderFields,
    validate,
    requiredFields = EMPTY_REQUIRED_FIELDS,
    onSubmit,
    onCancel,
    submitLabel = "Submit",
    cancelLabel = "Cancel",
    className,
    formClassName,
    showHeader = true,
    showActions = true,
    validateOnlyOnSubmit = false,
    requireAtLeastOneValue = true,
    initialValues,
  } = config;

  // ── Form state ────────────────────────────────────────────────────────
  const [fields, setFields] = useState<Record<string, unknown>>(
    () => initialValues ?? EMPTY_RECORD,
  );
  const [validationErrors, setValidationErrors] = useState<FormErrors>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Validation runner (stable reference via ref pattern) ──────────────
  const runValidation = useCallback(
    (nextFields: Record<string, unknown>): FormErrors => {
      if (!validate) {
        setValidationErrors({});
        return {};
      }
      const errors = validate(nextFields);
      setValidationErrors(errors);
      return errors;
    },
    [validate],
  );

  // ── Field change handlers ─────────────────────────────────────────────
  // Uses the same pattern as NewEntityModal: validate on every change AFTER
  // the first submit attempt (unless validateOnlyOnSubmit is true).

  /** Update a single field by dot-separated path. */
  const handleFieldChange = useCallback(
    (path: string, value: unknown) => {
      const next = updateField(fields, path, value);
      setFields(next);

      if (hasAttemptedSubmit && !validateOnlyOnSubmit) {
        runValidation(next);
      }
    },
    [fields, hasAttemptedSubmit, validateOnlyOnSubmit, runValidation],
  );

  /** Replace all fields at once (e.g. after AI autofill or batch update). */
  const handleFieldsChange = useCallback(
    (nextFields: Record<string, unknown>) => {
      setFields(nextFields);

      if (hasAttemptedSubmit && !validateOnlyOnSubmit) {
        runValidation(nextFields);
      }
    },
    [hasAttemptedSubmit, validateOnlyOnSubmit, runValidation],
  );

  // ── Actions ───────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setHasAttemptedSubmit(true);
    const errors = runValidation(fields);

    if (Object.keys(errors).length > 0) {
      return;
    }

    if (!onSubmit) return;

    setIsSubmitting(true);
    try {
      await onSubmit(fields);
      // Reset form after successful submit
      setFields(initialValues ?? {});
      setValidationErrors({});
      setHasAttemptedSubmit(false);
    } catch (e) {
      console.error("FormNode submit error:", e);
    } finally {
      setIsSubmitting(false);
    }
  }, [fields, runValidation, onSubmit, initialValues]);

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  const hasAtLeastOneValue = useMemo(
    () =>
      Object.values(fields).some(
        (val) => val !== undefined && val !== null && val !== "",
      ),
    [fields],
  );

  const submitDisabled =
    isSubmitting || (requireAtLeastOneValue && !hasAtLeastOneValue);

  // ── Render ────────────────────────────────────────────────────────────
  // Render renderFields as a React component so hooks work inside form fields.
  const FormFieldsComponent = renderFields as ComponentType<FormFieldRendererProps>;

  return (
    <NodeShell
      id={data.entityId}
      data={data}
      selected={selected}
      isConnectable={isConnectable}
      targetHandle={targetHandle}
      sourceHandle={sourceHandle}
      additionalTargetHandles={additionalTargetHandles}
      className={cn("w-86", className)}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      {showHeader && (
        <NodeShellHeader
          icon={icon}
          label={label}
          pendingCount={data.pendingChangeCount ?? 0}
        />
      )}

      {/* ── Form fields area ──────────────────────────────────────────── */}
      {/*
        Invoke renderFields as a JSX component so consumers can use React
        hooks inside their field renderer (e.g. to subscribe to edge/asset
        stores for connected image previews).

        The type assertion is safe: (props) => ReactNode is compatible with
        React.ComponentType, and JSX invocation enables hook support.
      */}
      <div className={cn("flex flex-col gap-4 p-4", formClassName)}>
        <FormFieldsComponent
          entityId={data.entityId}
          fields={fields}
          errors={validationErrors}
          hasAttemptedSubmit={hasAttemptedSubmit}
          requiredFields={requiredFields}
          onFieldChange={handleFieldChange}
          onFieldsChange={handleFieldsChange}
        />
      </div>

      {/* ── Action buttons ────────────────────────────────────────────── */}
      {showActions && (
        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          {onCancel && (
            <Button
              data-testid="form-cancel"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="nodrag"
            >
              {cancelLabel}
            </Button>
          )}
          {onSubmit && (
            <Button
              data-testid="form-submit"
              size="sm"
              onClick={handleSubmit}
              disabled={submitDisabled}
              className="nodrag"
            >
              {isSubmitting ? "Submitting…" : submitLabel}
            </Button>
          )}
        </div>
      )}
    </NodeShell>
  );
}
