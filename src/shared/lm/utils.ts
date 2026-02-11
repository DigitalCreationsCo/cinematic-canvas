import { ReferenceImage } from "./provider.js";
import { imageMimeType } from "../config.js";
import { getAllBestAssets } from "../utils/assets-utils.js";
import { AssetKey } from "../types/assets.types.js";
import { Character, Location, Scene } from "../types/workflow.types.js";
import mime from "mime-types";

export function toContentsImageInputs(referenceImages: (Partial<ReferenceImage> | undefined)[]): Promise<{ displayName: string; mimeType: string; fileUri: string; }[]> {
    return Promise.all(
        referenceImages
            .filter(u => u?.referenceImage?.gcsUri)
            .map(async (u) => {
                const fileParts = u!.referenceImage!.gcsUri!.split('/')!;
                const displayName = fileParts[ fileParts.length - 1 ];
                const mimeType = mime.lookup(displayName) || imageMimeType;
                return {
                    displayName,
                    mimeType,
                    fileUri: u!.referenceImage!.gcsUri!,
                };
            })
    );
};

export function referenceImageFrom(entities: Scene[] | Character[] | Location[], assetKeys: AssetKey[], description: string[]): Promise<ReferenceImage[]> {
    return Promise.all(entities
        .filter((e, index) => getAllBestAssets(e.assets)[assetKeys[index]]?.data)
        .map(async (e, index) => {
            const assets = getAllBestAssets(e.assets);
            const imageUri = assets[ assetKeys[ index ] ]?.data!;

            const referenceImage = {
                referenceImage: {
                    gcsUri: imageUri,
                    mimeType: (await fetch(imageUri, { method: 'HEAD' })).headers.get('Content-Type') || imageMimeType,
                },
                configuration: {
                    subjectType: "SUBJECT_TYPE_DEFAULT",
                    subjectDescription: description[ index ]
                }
            };
            return referenceImage;
        }));
}