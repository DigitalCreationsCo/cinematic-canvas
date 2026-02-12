import { ReferenceImage, SubjectReferenceImage, SubjectReferenceType } from "@google/genai";
import { ITextModelProvider} from "../provider.js";

export function buildReferenceImageFromParams(refs: Required<Parameters<ITextModelProvider['generateImages']>[0]>['referenceImages']): any[] {
    return refs.map((ref, index) => {
        const subjectReferenceImage = new SubjectReferenceImage();
        subjectReferenceImage.referenceId = index;
        subjectReferenceImage.referenceImage = {
            gcsUri: ref.referenceImage.gcsUri,
            mimeType: ref.referenceImage.mimeType || "image/png"
        };
        subjectReferenceImage.config = {
            subjectType: SubjectReferenceType[ref.configuration.subjectType as keyof typeof SubjectReferenceType] || SubjectReferenceType.SUBJECT_TYPE_DEFAULT,
            subjectDescription: ref.configuration.subjectDescription
        };
        return subjectReferenceImage;
    })
}