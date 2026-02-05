import {
    GenerateContentResponse,
    GenerateImagesResponse,
    GenerateVideosResponse,
    CountTokensResponse,
    TextModelProviderName,
    VideoModelProviderName,
    Video,
    Image,
} from "../llm/provider-types.js";
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
    type: T,
    response: TypeToResponseType[ T ],
    provider: T extends 'video' ? VideoModelProviderName : TextModelProviderName,
) {
    try {
        switch (type) {
            case 'video':
                return universalVideoExtractor(response as TypeToResponseType[ 'video' ], provider as VideoModelProviderName);
            case 'image':
                return universalImageExtractor(response as TypeToResponseType[ 'image' ], provider as TextModelProviderName);
            case 'audio':
                return universalAudioExtractor(response as TypeToResponseType[ 'audio' ], provider as TextModelProviderName);
            case 'text':
            default:
                return universalTextExtractor(response as TypeToResponseType[ 'text' ], provider as TextModelProviderName);
        }
    } catch (e) {
        return [];
    }
};

function universalVideoExtractor(response: TypeToResponseType[ 'video' ], provider: VideoModelProviderName): string[] {
    let videos: string[];
    switch (provider) {
        case 'ltx':
            videos = response?.response?.generatedVideos?.flatMap(v => v.video?.videoBytes).filter((v): v is string => !!v) || [];
            if (videos.length === 0) {
                throw new Error("LTX video generation failed to return any videos.");
            }
            return videos;
        case 'google':
        default:
            videos = response?.response?.generatedVideos?.flatMap(v => v.video?.videoBytes).filter((v): v is string => !!v) || [];
            if (videos.length === 0) {
                throw new Error("Google video generation failed to return any videos.");
            }
            return videos;
    }
}
function universalImageExtractor(response: TypeToResponseType[ 'image' ], provider: TextModelProviderName): string[] {
    switch (provider) {
        case 'google':
        default:
            if ("generatedImages" in response) {
                const images = response?.generatedImages?.flatMap(i => i.image?.imageBytes).filter((i): i is string => !!i) || [];
                if (images.length === 0) {
                    throw new Error("Image generation failed to return any images.");
                }
                return images;
            }
            return universalTextExtractor(response as GenerateContentResponse, provider);
    }
}
function universalTextExtractor(response: TypeToResponseType[ 'text' ], provider: TextModelProviderName): string[] {
    switch (provider) {
        case 'google':
        default:
            const text = response.candidates?.flatMap(c => c.content?.parts?.[ 0 ]?.inlineData?.data!) ||
                response.candidates?.flatMap(c => c.content?.parts?.[ 0 ]?.text!) || [];
            if (text.length === 0) {
                throw new Error("Text generation failed to return any text.");
            }
            return text;
    }
}
function universalAudioExtractor(response: TypeToResponseType[ 'audio' ], provider: TextModelProviderName): string[] {
    switch (provider) {
        case 'google':
        default:
            const audio = response.candidates?.flatMap(c => c.content?.parts?.[ 0 ]?.inlineData?.data!) ||
                response.candidates?.flatMap(c => c.content?.parts?.[ 0 ]?.text!) || [];
            if (audio.length === 0) {
                throw new Error("Audio generation failed to return any audio.");
            }
            return audio;
    }
}