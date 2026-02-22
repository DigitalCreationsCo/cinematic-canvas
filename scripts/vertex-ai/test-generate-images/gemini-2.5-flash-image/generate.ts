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

    const model = "gemini-2.5-flash-image";
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
                role: 'user',
                parts: [ {
                    inlineData: {
                        data: charBase64,
                        mimeType: "image/png"
                    }
                },
                { text: 'Character: Chaac' }
                ]
            },
            {
                role: 'user',
                parts: [ {
                    inlineData: {
                        data: locBase64,
                        mimeType: "image/png"
                    }
                },
                {
                    text: 'Location: Xibalba'
                }
                ]
            },
            {
                role: 'user',
                parts: [
                    {
                        text: `Generate a cinematic shot of the character jumping off the location.`
                    }
                ]
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
