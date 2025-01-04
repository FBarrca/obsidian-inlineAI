// api.ts
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { MyPluginSettings } from "./settings";
import { App, MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { setAIResponseEffect } from "./modules/AIExtension";

/**
 * Class to manage interactions with different chat APIs.
 */
export class ChatApiManager {
  private chatClient: ChatOpenAI | ChatOllama;
  private app: App;

  /**
   * Initializes the ChatApiManager with the given settings.
   * @param settings - Configuration settings for the chat API.
   */
  constructor(private settings: MyPluginSettings, app: App) {
    this.app = app;
    this.chatClient = this.initializeChatClient(settings);
  }

  /**
   * Initializes the appropriate chat client based on the provider specified in settings.
   * @param settings - Configuration settings for the chat API.
   * @returns An instance of ChatOpenAI or ChatOllama.
   * @throws Error if the provider is unsupported or required settings are missing.
   */
  private initializeChatClient(settings: MyPluginSettings): ChatOpenAI | ChatOllama {
    switch (settings.provider) {
      case "openai":
        if (!settings.apiKey) {
          throw new Error("OpenAI API key is required when using OpenAI as the provider.");
        }
        return new ChatOpenAI({
          modelName: settings.model,
          temperature: 0, // Set temperature to 0 for deterministic outputs
          apiKey: settings.apiKey,
        });

      case "ollama":
        return new ChatOllama({
          model: settings.model,
          // Add other necessary configurations for Ollama if needed
        });

      default:
        throw new Error(`Unsupported provider: ${settings.provider}`);
    }
  }

  /**
   * Calls the chat API with the provided content and context.
   * @param systemMessage - The system message to send to the chat API.
   * @param message - The user's message to send to the chat API.
   * @returns A promise that resolves with the generated content.
   * @throws Error if the API call fails.
   */
  public async callApi(systemMessage: string, message: string): Promise<string> {
    const messages = [
      new SystemMessage(systemMessage),
      new HumanMessage(message),
    ];

    try {
      const aiMessage: AIMessage = await this.chatClient.invoke(messages);
      return aiMessage.content.toString();
    } catch (error) {
      console.error("Error calling the chat model:", error);
      throw new Error("Failed to generate response from the chat model.");
    }
  }

  /**
   * Handles user input and updates the editor with the response.
   * @param systemPrompt - The system prompt to send to the chat API.
   * @param userRequest - The user's request to process.
   * @returns The AI-generated response.
   */
  private async handleEditorUpdate(systemPrompt: string, userRequest: string): Promise<string> {
    try {
      const response = await this.callApi(systemPrompt, userRequest);
      const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);

      if (!markdownView) return "";

      const mainEditorView = (markdownView.editor as any).cm as EditorView;
      mainEditorView?.dispatch({
        effects: setAIResponseEffect.of({ airesponse: response, prompt: userRequest }),
      });

      return response;
    } catch (error) {
      console.error("Error processing request:", error);
      throw new Error("Failed to process request.");
    }
  }

  /**
   * Handles user input and generates a response using the cursor API.
   * @param userRequest - The user's request to process.
   * @returns The AI-generated response.
   */
  public async callCursor(userRequest: string): Promise<string> {
    const systemPrompt = "You are a helpful assistant. Please help the user with the following request:";
    return this.handleEditorUpdate(systemPrompt, userRequest);
  }

  /**
   * Processes selected text using the specified prompt and transformation.
   * @param prompt - The transformation prompt (e.g., "Add Emojis").
   * @param selectedText - The selected text to transform.
   * @returns The transformed text.
   */
  public async callSelection(prompt: string, selectedText: string): Promise<string> {
    const systemPrompt = `
**System Prompt:**
You are an advanced language model that performs text transformations based on specific instructions. Your task is to process input text to produce the desired output based on a given transformation type. You can handle tasks like adding emojis, making text longer or shorter, and converting text into tables among many others. Follow the examples provided to guide your responses.
It is **very important** that you follow the examples. Do not add anything at the start of the output like "Output:" or "Here's arephrased version of the input text:" or anything similar. Just provide the transformed text.

**Examples:**

---

**Task:** Add Emojis.  
**Prompt:** Add relevant emojis to make the text more engaging.  

**Input:**  
"Let's celebrate the success of our project."  

**Output:**  
"🎉 Let's celebrate the success of our project! 🚀👏"  

---
`;

    const userPrompt = `
**Task:** ${prompt}  
**Input:**  
${selectedText}

**Output:**`
    return this.handleEditorUpdate(systemPrompt, userPrompt);
  }
}
