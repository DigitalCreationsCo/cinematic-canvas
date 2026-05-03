import CharacterForm from './CharacterForm.js';
import LocationForm from './LocationForm.js';
import SceneForm from './SceneForm.js';
import { EntityCreatableType } from '#shared/types/entity.types.js';
import { EntityFormData, EntityFormErrors } from './entityFormValidation.js';

export interface EntityFormFieldsProps {
    entityType: EntityCreatableType;
    fields: EntityFormData;
    onChange: (fields: EntityFormData) => void;
    projectId?: string;
    errors?: EntityFormErrors;
    requiredFields?: readonly string[];
}

export const updateField = (current: EntityFormData, path: string, value: unknown): EntityFormData => {
    const keys = path.split('.');
    const result = { ...current };
    let obj = result as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
        if (typeof obj[keys[i]] !== 'object' || obj[keys[i]] === null) {
            obj[keys[i]] = {};
        }
        obj[keys[i]] = { ...obj[keys[i]] as Record<string, unknown> };
        obj = obj[keys[i]] as Record<string, unknown>;
    }
    obj[keys[keys.length - 1]] = value;
    return result;
};

export function EntityFormFields({ entityType, fields, onChange, projectId, errors = {}, requiredFields = [] }: EntityFormFieldsProps) {
    const formContent = (
        <>
            {entityType === 'character' && (
                <CharacterForm
                    fields={fields}
                    onChange={onChange}
                    errors={errors}
                    requiredFields={requiredFields}
                />
            )}
            {entityType === 'location' && (
                <LocationForm
                    fields={fields}
                    onChange={onChange}
                    errors={errors}
                    requiredFields={requiredFields}
                />
            )}
            {entityType === 'scene' && (
                <SceneForm
                    fields={fields}
                    onChange={onChange}
                    projectId={projectId!}
                    errors={errors}
                    requiredFields={requiredFields}
                />
            )}
        </>
    );

    return (
        <div data-testid="form-fields-entity" className="max-h-[50vh] overflow-y-auto pr-2">
            {formContent}
        </div>
    );
}
