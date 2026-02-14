import { MediaProcessingAgent } from "../media-processing-agent.js";
import { MediaController } from "../../services/media-controller.js";
import { JobRenderVideo } from "../../types/job.types.js";

describe("MediaProcessingAgent - renderVideo", () => {
    let agent: MediaProcessingAgent;
    let mockMediaController: jest.Mocked<MediaController>;
    let mockStorageManager: any;

    const mockJob: JobRenderVideo = {
        projectId: "proj_123",
        payload: {
            videoPaths: [ "path/1.mp4", "path/2.mp4" ],
            audioGcsUri: "gs://bucket/audio.mp3"
        },
        attempts: { currentAttempt: 2 }
    } as any;

    beforeEach(() => {
        mockMediaController = {
            renderScenes: jest.fn(),
        } as any;
        agent = new MediaProcessingAgent(null as any, null as any, mockMediaController);
    });

    it("should return a processed video object on success", async () => {
        mockMediaController.renderScenes.mockResolvedValue({
            gcsUri: "gs://bucket/video.mp4",
            thumbnailGcsUri: "gs://bucket/thumb.jpg",
            duration: 120
        });

        const result = await agent.renderVideo(mockJob, "My Movie");

        expect(result).toEqual({
            id: "proj_123",
            title: "My Movie",
            thumbnailGcsUri: "gs://bucket/thumb.jpg",
            videoGcsUri: "gs://bucket/video.mp4",
            duration: 120
        });
        expect(mockMediaController.renderScenes).toHaveBeenCalledWith(
            [ "path/1.mp4", "path/2.mp4" ],
            "proj_123",
            2,
            "gs://bucket/audio.mp3"
        );
    });

    it("should log and throw an error if the controller fails", async () => {
        const error = new Error("FFMPEG_FAILURE");
        mockMediaController.renderScenes.mockRejectedValue(error);
        const consoleSpy = jest.spyOn(console, "error").mockImplementation();

        await expect(agent.renderVideo(mockJob, "Title")).rejects.toThrow("FFMPEG_FAILURE");
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});