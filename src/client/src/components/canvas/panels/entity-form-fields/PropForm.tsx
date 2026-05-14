import { Input } from "#client/components/ui/input.js";
import { Textarea } from "#client/components/ui/textarea.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#client/components/ui/select.js";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "#client/components/ui/accordion.js";
import {
  EntityFormFieldsProps,
  updateField,
} from "#client/components/canvas/panels/entity-form-fields/EntityFormFields.js";
import {
  EntityFieldErrorMessage,
  EntityFieldLabel,
  getFieldControlClassName,
} from "#client/components/canvas/panels/entity-form-fields/entityFormValidationUi.js";
import { PropFormData } from "#client/components/canvas/panels/entity-form-fields/entityFormValidation.js";

interface TypedFields {
  [key: string]: unknown;
  type?: string;
  referenceId?: string;
}

const PROP_TYPE_OPTIONS = [
  { value: "furniture", label: "Furniture" },
  { value: "weapon", label: "Weapon" },
  { value: "vehicle", label: "Vehicle" },
  { value: "electronics", label: "Electronics" },
  { value: "clothing_accessory", label: "Clothing/Accessory" },
  { value: "tool", label: "Tool" },
  { value: "book_document", label: "Book/Document" },
  { value: "musical_instrument", label: "Musical Instrument" },
  { value: "sports_equipment", label: "Sports Equipment" },
  { value: "decorative", label: "Decorative" },
  { value: "other", label: "Other" },
];

export default function PropForm({
  fields,
  onChange,
  errors = {},
  requiredFields = [],
}: Omit<EntityFormFieldsProps, "entityType">) {
  const propFields = fields as PropFormData;
  const tf = propFields as TypedFields;

  return (
    <Accordion type="multiple" defaultValue={["basic"]} className="w-full">
      <AccordionItem value="basic">
        <AccordionTrigger>Basic Information</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="name"
                requiredFields={requiredFields}
              >
                Name
              </EntityFieldLabel>
              <Input
                data-testid="input-name"
                value={(fields.name as string) || ""}
                onChange={(e) =>
                  onChange(updateField(fields, "name", e.target.value))
                }
                placeholder="Prop name (e.g., Ruby Rose Sword)"
                aria-invalid={Boolean(errors.name)}
                className={getFieldControlClassName(errors, "name")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="name" />
            </div>

            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="description"
                requiredFields={requiredFields}
              >
                Description
              </EntityFieldLabel>
              <Textarea
                data-testid="input-description"
                value={(fields.description as string) || ""}
                onChange={(e) =>
                  onChange(updateField(fields, "description", e.target.value))
                }
                placeholder="Describe the prop in detail..."
                aria-invalid={Boolean(errors.description)}
                className={getFieldControlClassName(errors, "description")}
              />
              <EntityFieldErrorMessage
                errors={errors}
                fieldPath="description"
              />
            </div>

            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="type"
                requiredFields={requiredFields}
              >
                Prop Type
              </EntityFieldLabel>
              <Select
                clearable
                value={(propFields.type as string) || ""}
                onValueChange={(v) => onChange(updateField(fields, "type", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.type)}
                  className={getFieldControlClassName(errors, "type")}
                >
                  <SelectValue placeholder="Select prop type" />
                </SelectTrigger>
                <SelectContent>
                  {PROP_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="type" />
            </div>

            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="referenceId"
                requiredFields={requiredFields}
              >
                Reference ID
              </EntityFieldLabel>
              <Input
                value={(tf.referenceId as string) || ""}
                onChange={(e) =>
                  onChange(updateField(fields, "referenceId", e.target.value))
                }
                placeholder="Narrative-scoped identifier (e.g., prop_1)"
                aria-invalid={Boolean(errors.referenceId)}
                className={getFieldControlClassName(errors, "referenceId")}
              />
              <EntityFieldErrorMessage
                errors={errors}
                fieldPath="referenceId"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
