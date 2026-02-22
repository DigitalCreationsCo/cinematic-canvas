import { ContentReferenceImage, GoogleGenAI, StyleReferenceImage, SubjectReferenceImage, SubjectReferenceType } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

(async () => {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    // Note: 'global' may need to be 'us-central1' for Imagen API access
    const lm = new GoogleGenAI({
        vertexai: true,
        project: projectId,
        location: "us-central1"
    });
    console.log(`Initialized GoogleGenAI client with project ${projectId}. Vertex AI: ${lm.vertexai} `);

    // 1. Prepare Image Data
    const charBase64 = fs.readFileSync(path.resolve(__dirname, '../assets/char.png'), 'base64');
    const locBase64 = fs.readFileSync(path.resolve(__dirname, '../assets/loc.png'), 'base64');

    console.log(`Generating image...`);
    const result = await lm.models.editImage({
        prompt: "A high-quality photo of Jimbo standing in the center of House during a lightning storm.",
        model: "imagen-3.0-capability-001",
        referenceImages: [
            Object.assign(new SubjectReferenceImage(), {
                referenceId: 1,
                config: {
                    subjectType: SubjectReferenceType.SUBJECT_TYPE_PERSON,
                    subjectDescription: "Jimbo"
                },
                referenceImage: {
                    imageBytes: charBase64,
                    mimeType: 'image/png'
                }
            }),
            Object.assign(new ContentReferenceImage(), {
                referenceId: 2,
                config: {
                    contentDescription: "House"
                },
                referenceImage: {
                    imageBytes: locBase64,
                    mimeType: 'image/png'
                }
            })
        ],
        config: {
            numberOfImages: 1,
            aspectRatio: "16:9",
        }
    });

    const imageBytes = result.generatedImages?.[ 0 ]?.image?.imageBytes;
    if (!imageBytes) {
        throw new Error('No image generated');
    }

    const outputPath = path.resolve(__dirname, `output-${Date.now()}.png`);
    fs.writeFileSync(outputPath, Buffer.from(imageBytes, 'base64'));
    console.log('Image generated at ', outputPath);
})();
