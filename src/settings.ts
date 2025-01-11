import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";
import { cursorPrompt, selectionPrompt } from "./default_prompts";

// Interface for the settings
export interface InlineAISettings {
	provider: "openai" | "ollama" | "custom";
	model: string;
	apiKey?: string;
	customURL?: string; // Add a custom URL field
	selectionPrompt: string;
	cursorPrompt: string;
}

// Default settings values
export const DEFAULT_SETTINGS: InlineAISettings = {
	provider: "ollama",
	model: "llama3.2",
	apiKey: "",
	customURL: "",
	selectionPrompt: selectionPrompt,
	cursorPrompt: cursorPrompt,
};

// Settings tab class to display settings in Obsidian UI
export class InlineAISettingsTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Provider setting
		new Setting(containerEl)
			.setName("Provider")
			.setDesc("Choose between OpenAI, Ollama, or a custom OpenAI-compatible endpoint.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("openai", "OpenAI")
					.addOption("ollama", "Ollama")
					.addOption("custom", "Custom/OpenAI-compatible")
					.setValue(this.plugin.settings.provider)
					.onChange(async (value) => {
						this.plugin.settings.provider = value as "openai" | "ollama" | "custom";
						await this.plugin.saveSettings();
						this.display(); // Refresh to update the API key field visibility
					})
			);

		// Model setting
		new Setting(containerEl)
			.setName("Model")
			.setDesc("Specify the model to use.")
			.addText(text =>
				text
					.setPlaceholder("e.g., gpt-4o-mini")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					})
			);

		// API Key setting (conditionally displayed for OpenAI suported endpoints
		if (this.plugin.settings.provider === "openai" || 
			this.plugin.settings.provider === "custom"
		) {
			new Setting(containerEl)
				.setName("API Key")
				.setDesc("Enter your API key.")
				.addText((text) =>
					text
						.setPlaceholder("sk-...")
						.setValue(this.plugin.settings.apiKey || "")
						.onChange(async (value) => {
							this.plugin.settings.apiKey = value;
							await this.plugin.saveSettings();
						})
				);
		}

		/**
		 * If the user chooses 'custom', show a field for the base endpoint URL.
		 */
		if (this.plugin.settings.provider === "custom") {
			new Setting(containerEl)
			.setName("Custom Endpoint")
			.setDesc("Enter your OpenAI-compatible base URL (e.g. https://api.groq.com/openai/v1).")
			.addText((text) =>
				text
				.setPlaceholder("https://api.mycustomhost.com/v1")
				.setValue(this.plugin.settings.customURL || "")
				.onChange(async (value) => {
					this.plugin.settings.customURL = value;
					await this.plugin.saveSettings();
				})
			);
		}

		// Advanced Section
		new Setting(containerEl)
			.setName("Advanced")
			.setHeading();

		// Selection Prompt setting
		new Setting(containerEl)
			.setName("Selection Prompt")
			.setDesc("System Prompt used when the tooltip is triggered with selected text.")
			.addTextArea((textarea) => {
				textarea
					.setPlaceholder("e.g., Summarize the selected text.")
					.setValue(this.plugin.settings.selectionPrompt)
					.onChange(async (value) => {
						this.plugin.settings.selectionPrompt = value;
						await this.plugin.saveSettings();
					});

				// Add a CSS class for styling
				textarea.inputEl.classList.add("wide-text-settings");
			});

		// Cursor Prompt setting
		new Setting(containerEl)
			.setName("Cursor Prompt")
			.setDesc("System Prompt used when the tooltip is triggered with selected text.")
			.addTextArea((textarea) => {
				textarea
					.setPlaceholder("e.g., Generate text based on cursor position.")
					.setValue(this.plugin.settings.cursorPrompt)
					.onChange(async (value) => {
						this.plugin.settings.cursorPrompt = value;
						await this.plugin.saveSettings();
					});

				// Add a CSS class for styling
				textarea.inputEl.classList.add("wide-text-settings");
			});
	}
}
