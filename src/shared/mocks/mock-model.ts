import { TextModelController } from "#shared/lm/text-model-controller.js";
import { VideoModelController } from "#shared/lm/video-model-controller.js";
import { automockClass } from "#shared/mocks/mock.utils.js";
import { Mocked } from "vitest";

export const createMockTextModel = (): Mocked<TextModelController> => automockClass(TextModelController);
export const createMockVideoModel = (): Mocked<VideoModelController> => automockClass(VideoModelController);
