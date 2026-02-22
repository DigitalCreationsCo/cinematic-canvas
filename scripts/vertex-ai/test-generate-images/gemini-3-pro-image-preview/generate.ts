import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

(async () => {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    const lm = new GoogleGenAI({
        vertexai: true,
        project: projectId,
        location: "global"
    });

    const model = "gemini-3-pro-image-preview";
    console.log({
        project: projectId,
        vertexai: lm.vertexai,
        model
    }, `Initialized GoogleGenAI client with project ${projectId}`);

    const charBase64 = fs.readFileSync(path.resolve(__dirname, '../assets/char.png'), 'base64');
    const locBase64 = fs.readFileSync(path.resolve(__dirname, '../assets/loc.png'), 'base64');

    const result = await lm.models.generateContent({
        model,
        contents: [
            {
                inlineData: {
                    data: charBase64,
                    mimeType: "image/png"
                }
            },
            {
                inlineData: {
                    data: locBase64,
                    mimeType: "image/png"
                }
            },
            {
                text: `Based on the two images provided:
                   The first image is a person named Jimbo.
                   The second image is a location called House.
                   Generate a new high-quality photo of Jimbo standing in the center of House during a lightning storm.`
            }
        ]
    });

    const imagePart = result.candidates?.[ 0 ]?.content?.parts?.find(part => part.inlineData);

    if (!imagePart?.inlineData?.data) {
        throw new Error('No image generated in the response.');
    }

    const outputPath = path.resolve(__dirname, `output-${Date.now()}.png`);
    fs.writeFileSync(outputPath, Buffer.from(imagePart.inlineData.data, 'base64'));
    console.log('Image generated at ', outputPath);
})();
