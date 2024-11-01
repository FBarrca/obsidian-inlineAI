// MyPluginSettings.ts
import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";

// Interface for the settings
export interface MyPluginSettings {
	provider: "openai" | "ollama";
	model: string;
	apiKey?: string;
}

// Default settings values
export const DEFAULT_SETTINGS: MyPluginSettings = {
	provider: "openai",
	model: "text-davinci-003",
	apiKey: "",
};

// Settings tab class to display settings in Obsidian UI
export class MyPluginSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "My Plugin Settings" });

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
	}
}
