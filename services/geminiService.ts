
import { GoogleGenAI } from "@google/genai";

/**
 * Service to interact with Gemini API for schedule analysis.
 */
export const analyzeSchedule = async (scheduleText: string) => {
  // Always obtain a fresh instance with the current process.env.API_KEY as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    // Using gemini-3-pro-preview for complex reasoning task: schedule analysis and conflict detection
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Analyze this squad schedule and identify any obvious overlaps or mentor conflicts. Suggest optimizations if possible. 
      Schedule data: ${scheduleText}`,
      config: {
        temperature: 0.7,
      }
    });
    // Accessing .text property directly as per guidelines
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error analyzing schedule.";
  }
};
