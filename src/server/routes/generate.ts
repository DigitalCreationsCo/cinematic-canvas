import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { TextModelController } from "../../shared/lm/text-model-controller.js";
import { db } from "../../shared/db/index.js";

export const generateRouter = Router();

generateRouter.post("/api/entities/generate-fields", requireAuth, async (req, res) => {
  try {
    const { entityType, currentFields, promptContext } = req.body;

    const controller = new TextModelController('google', { modeModelPriority: 'quality' });

    const prompt = `
      You are an expert creative writer and world builder.
      You need to complete the specification for a ${entityType}.
      
      Here is the context provided:
      ${promptContext || 'No context provided.'}
      
      Here are the current fields:
      ${JSON.stringify(currentFields, null, 2)}
      
      Please complete any missing fields or expand on the existing ones to make a rich, detailed character/location/scene.
      Respond ONLY with a valid JSON object matching the fields provided.
    `;

    const result = await controller.generateContent({
      model: controller.textModel,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = result.text;
    if (!text) throw new Error("No text generated");

    const json = JSON.parse(text);
    res.json(json);
  } catch (error) {
    console.error("Failed to generate fields:", error);
    res.status(500).json({ error: error.message || "Failed to generate fields." });
  }
});
