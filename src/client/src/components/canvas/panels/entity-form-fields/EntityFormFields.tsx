import CharacterForm from './CharacterForm.js';
import LocationForm from './LocationForm.js';
import SceneForm from './SceneForm.js';

export interface EntityFormFieldsProps {
    entityType: 'character' | 'location' | 'scene';
    fields: Record<string, unknown>;
    onChange: (fields: Record<string, unknown>) => void;
}

export const updateField = (current: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> => {
    const keys = path.split('.');
    const result = { ...current };
    let obj = result;
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

export function EntityFormFields({ entityType, fields, onChange }: EntityFormFieldsProps) {
    const formContent = (
        <>
            {entityType === 'character' && <CharacterForm fields={fields} onChange={onChange} />}
            {entityType === 'location' && <LocationForm fields={fields} onChange={onChange} />}
            {entityType === 'scene' && <SceneForm fields={fields} onChange={onChange} />}
        </>
    );

    return (
        <div className="max-h-[50vh] overflow-y-auto pr-2">
            {formContent}
        </div>
    );
}