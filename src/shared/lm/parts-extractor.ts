import {
    GenerateContentResponse,
    GenerateImagesResponse,
    GenerateVideosResponse,
    CountTokensResponse,
    TextModelProviderName,
    VideoModelProviderName,
    Video,
    Image,
} from "./provider.js";
import { AssetType } from "../types/assets.types.js";

export type TypeToResponseType = {
    video: GenerateVideosResponse;
    image: GenerateImagesResponse | GenerateContentResponse;
    audio: GenerateContentResponse;
    text: GenerateContentResponse;
    json: GenerateContentResponse;
    token: CountTokensResponse;
};

export function extractGeneratedResponse<T extends AssetType>(
    assetType: T,
    responseGeneric: TypeToResponseType[ T ],
    providerName: T extends 'video' ? VideoModelProviderName : TextModelProviderName,
): string[] {
    try {
        switch (assetType) {
            case 'video':
                return universalVideoExtractor(responseGeneric as TypeToResponseType[ 'video' ], providerName as VideoModelProviderName);
            case 'image':
                return universalImageExtractor(responseGeneric as TypeToResponseType[ 'image' ], providerName as TextModelProviderName);
            case 'audio':
                return universalAudioExtractor(responseGeneric as TypeToResponseType[ 'audio' ], providerName as TextModelProviderName);
            case 'text':
            default:
                return universalTextExtractor(responseGeneric as TypeToResponseType[ 'text' ], providerName as TextModelProviderName);
        }
    } catch (errorExtractor) {
        console.error(`[extractGeneratedResponse] Failed to extract ${assetType} from ${providerName}`, {
            error: errorExtractor instanceof Error ? errorExtractor.message : errorExtractor,
            responsePreview: JSON.stringify(responseGeneric).slice(0, 100)
        });
        return [];
    }
}

/**
 * Logic for Video Assets (e.g., LTX, Google Veo)
 */
export function universalVideoExtractor(responseLTX: TypeToResponseType[ 'video' ], providerName: VideoModelProviderName): string[] {
    const rawVideos: (string | undefined)[] = responseLTX?.response?.generatedVideos?.flatMap(v => v.video?.videoBytes) ?? [];

    const cleanedVideos = rawVideos.filter((v): v is string => typeof v === 'string' && v.length > 0);

    console.debug(`[universalVideoExtractor] Extracted ${cleanedVideos.length} videos from ${providerName}`);

    if (cleanedVideos.length === 0) {
        throw new Error(`${providerName} video generation returned no valid video bytes.`);
    }
    return cleanedVideos;
}

/**
 * Logic for Image Assets
 */
export function universalImageExtractor(responseGoogle: TypeToResponseType[ 'image' ], providerName: TextModelProviderName): string[] {
    // Standard image container check
    if ("generatedImages" in responseGoogle) {
        const rawImages: (string | undefined)[] = responseGoogle?.generatedImages?.flatMap(i => i.image?.imageBytes) ?? [];
        const cleanedImages = rawImages.filter((i): i is string => typeof i === 'string' && i.length > 0);

        if (cleanedImages.length > 0) return cleanedImages;
    }

    console.warn(`[universalImageExtractor] No images found in standard path for ${providerName}, attempting text fallback.`);
    return universalTextExtractor(responseGoogle as any, providerName);
}

/**
 * Logic for Text/Narrative Assets
 */
export function universalTextExtractor(responseText: TypeToResponseType[ 'text' ], providerName: TextModelProviderName): string[] {
    const rawText: (string | undefined)[] = responseText.candidates?.flatMap(candidate => {
        const part = candidate.content?.parts?.[ 0 ];
        return part?.inlineData?.data ?? part?.text;
    }) ?? [];

    const cleanedText = rawText.filter((t): t is string => typeof t === 'string' && t.length > 0);

    if (cleanedText.length === 0) {
        throw new Error(`${providerName} text extraction failed: no valid content parts found.`);
    }
    return cleanedText;
}

/**
 * Logic for Audio/Speech Assets
 */
export function universalAudioExtractor(responseAudio: TypeToResponseType[ 'audio' ], providerName: TextModelProviderName): string[] {
    const rawAudio: (string | undefined)[] = responseAudio.candidates?.flatMap(candidate => {
        const part = candidate.content?.parts?.[ 0 ];
        // Audio usually arrives via inlineData.data (base64)
        return part?.inlineData?.data ?? part?.text;
    }) ?? [];

    const cleanedAudio = rawAudio.filter((a): a is string => typeof a === 'string' && a.length > 0);

    if (cleanedAudio.length === 0) {
        throw new Error(`${providerName} audio generation returned no valid data.`);
    }
    return cleanedAudio;
}