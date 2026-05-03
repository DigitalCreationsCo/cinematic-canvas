import type { ReactNode } from 'react';
import { Label } from '#client/components/ui/label.js';
import { cn } from '#client/lib/utils.js';
import { EntityFormErrors, getFieldError, hasFieldError, isFieldRequired } from './entityFormValidation.js';

interface EntityFieldLabelProps {
  children: ReactNode;
  className?: string;
  errors: EntityFormErrors;
  fieldPath: string;
  requiredFields: readonly string[];
}

export function EntityFieldLabel({
  children,
  className,
  errors,
  fieldPath,
  requiredFields,
}: EntityFieldLabelProps) {
  return (
    <Label className={cn(hasFieldError(errors, fieldPath) && 'text-destructive', className)}>
      {children}
      {isFieldRequired(requiredFields, fieldPath) && <span className="text-destructive"> *</span>}
    </Label>
  );
}

export function EntityFieldErrorMessage({
  errors,
  fieldPath,
}: {
  errors: EntityFormErrors;
  fieldPath: string;
}) {
  const error = getFieldError(errors, fieldPath);

  if (!error) {
    return null;
  }

  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {error}
    </p>
  );
}

export const getFieldControlClassName = (errors: EntityFormErrors, fieldPath: string): string | undefined =>
  hasFieldError(errors, fieldPath)
    ? 'border border-destructive focus-visible:ring-destructive focus:ring-destructive'
    : undefined;
