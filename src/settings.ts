// MyPluginSettings.ts
import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";
import { cursorPrompt, selectionPrompt } from "./default_prompts";

// Interface for the settings
export interface InlineAISettings {
	provider: "openai" | "ollama";
	model: string;
	apiKey?: string;
	selectionPrompt: string;
	cursorPrompt: string;
}

// Default settings values
export const DEFAULT_SETTINGS: InlineAISettings = {
	provider: "ollama",
	model: "llama3.2",
	apiKey: "",
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
			.setDesc("Choose between OpenAI or Ollama as your provider.")
			.addDropdown(dropdown =>
				dropdown
					.addOption("openai", "OpenAI")
					.addOption("ollama", "Ollama")
					.setValue(this.plugin.settings.provider)
					.onChange(async (value) => {
						this.plugin.settings.provider = value as "openai" | "ollama";
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
					.setPlaceholder("e.g., text-davinci-003")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					})
			);

		// API Key setting (only for OpenAI)
		if (this.plugin.settings.provider === "openai") {
			new Setting(containerEl)
				.setName("OpenAI API Key")
				.setDesc("Enter your OpenAI API key.")
				.addText(text =>
					text
						.setPlaceholder("sk-...")
						.setValue(this.plugin.settings.apiKey || "")
						.onChange(async (value) => {
							this.plugin.settings.apiKey = value;
							await this.plugin.saveSettings();
						})
				);
		}

		// Advanced Section
		containerEl.createEl("h3", { text: "Advanced Settings" });
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

				// Make the text area wider
				textarea.inputEl.style.width = "25em";
				textarea.inputEl.style.height = "10em";

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

				// Make the text area wider
				textarea.inputEl.style.width = "25em";
				textarea.inputEl.style.height = "10em";

			});

	}
}
