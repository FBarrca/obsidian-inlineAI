// api.ts
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama"; // Replace with actual Ollama import

import {
  generateFineGrainedConflictWithinLine,
  generateFineGrainedConflictWithinLineString,
} from "./helpers/conflictMarkers";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { MyPluginSettings } from "./settings";

// Function to initialize the appropriate chat client based on provider
function initializeChatClient(settings: MyPluginSettings) {
  if (settings.provider === "openai") {
    if (!settings.apiKey) {
      throw new Error("OpenAI API key is required when using OpenAI as the provider.");
    }
    return new ChatOpenAI({
      modelName: settings.model,
      temperature: 0, // Set temperature to 0 for deterministic outputs
      apiKey: settings.apiKey,
    });
  } else if (settings.provider === "ollama") {
    // Initialize Ollama client. Replace with actual initialization code.
    return new ChatOllama({
      model: settings.model,
      // Add other necessary configurations for Ollama if needed
    });
  } else {
    throw new Error(`Unsupported provider: ${settings.provider}`);
  }
}

export async function callApi(
  content: string,
  context: string,
  settings: MyPluginSettings
): Promise<{ generated: string; diff: string }> {
  // Initialize the appropriate chat client based on settings
  const chat = initializeChatClient(settings);

  // Prepare the messages array using LangChain message classes
  const messages = [
    new SystemMessage(
      "Reply to the user request, do not add any intro messages or any alternative outputs, just do one example of what you are told"
    ),
    new HumanMessage(`\`\`\`\n${context}\n${content}\`\`\``),
  ];

  try {
    // Call the chat model with the prepared messages
    const aiMessage: AIMessage = await chat.call(messages);
    const generatedContentString = aiMessage.content.toString();

    // Log the fine-grained conflict for debugging or analysis
    console.log(
      generateFineGrainedConflictWithinLine(context, generatedContentString)
    );

    return {
      generated: generatedContentString,
      diff: generateFineGrainedConflictWithinLineString(
        context,
        generatedContentString
      ),
    };
  } catch (error) {
    console.error("Error calling the chat model:", error);
    throw new Error("Failed to generate response from the chat model.");
  }
}
