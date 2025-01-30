import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";
import { cursorPrompt, selectionPrompt } from "./default_prompts";
import { SlashCommand } from "./modules/commands/source";

// Interface for the settings
export interface InlineAISettings {
	provider: "openai" | "ollama" | "custom";
	model: string;
	apiKey?: string;
	customURL?: string;
	selectionPrompt: string;
	cursorPrompt: string;
	customCommands: SlashCommand[];
	commandPrefix: string;
}

// Default settings values
export const DEFAULT_SETTINGS: InlineAISettings = {
	provider: "ollama",
	model: "llama3.2",
	apiKey: "",
	customURL: "",
	selectionPrompt: selectionPrompt,
	cursorPrompt: cursorPrompt,
	customCommands: [],
	commandPrefix: "/"
};

export class InlineAISettingsTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Function to save settings after user finishes editing */
	private async saveSettings() {
		await this.plugin.saveSettings();
		this.plugin.chatapi.updateSettings(this.plugin.settings);
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
						await this.saveSettings();
						this.display(); // Refresh UI to show/hide API key field
					})
			);

		// Model setting
		new Setting(containerEl)
			.setName("Model")
			.setDesc("Specify the model to use.")
			.addText((text) => {
				text.setPlaceholder("e.g., gpt-4o-mini")
					.setValue(this.plugin.settings.model)
					.inputEl.addEventListener("blur", async () => {
						this.plugin.settings.model = text.getValue();
						await this.saveSettings();
					});
			});

		// API Key setting (conditionally displayed for OpenAI-supported endpoints)
		if (this.plugin.settings.provider === "openai" || this.plugin.settings.provider === "custom") {
			new Setting(containerEl)
				.setName("API key")
				.setDesc("Enter your API key.")
				.addText((text) => {
					text.setPlaceholder("sk-...")
						.setValue(this.plugin.settings.apiKey || "")
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.apiKey = text.getValue();
							await this.saveSettings();
						});
				});
		}

		// Custom endpoint setting (only for "custom" provider)
		if (this.plugin.settings.provider === "custom") {
			new Setting(containerEl)
				.setName("Custom endpoint")
				.setDesc("Enter your OpenAI-compatible base URL (e.g. https://api.groq.com/openai/v1).")
				.addText((text) => {
					text.setPlaceholder("https://api.mycustomhost.com/v1")
						.setValue(this.plugin.settings.customURL || "")
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.customURL = text.getValue();
							await this.saveSettings();
						});
				});
		}

		// Advanced Section
		new Setting(containerEl).setName("Advanced").setHeading();

		// Selection Prompt setting
		new Setting(containerEl)
			.setName("Selection prompt")
			.setDesc("System Prompt used when the tooltip is triggered with selected text.")
			.addTextArea((textarea) => {
				textarea.setPlaceholder("e.g., Summarize the selected text.")
					.setValue(this.plugin.settings.selectionPrompt)
					.inputEl.addEventListener("blur", async () => {
						this.plugin.settings.selectionPrompt = textarea.getValue();
						await this.saveSettings();
					});
				textarea.inputEl.classList.add("wide-text-settings");
			});

		// Cursor Prompt setting
		new Setting(containerEl)
			.setName("Cursor prompt")
			.setDesc("System Prompt used when the tooltip is triggered with selected text.")
			.addTextArea((textarea) => {
				textarea.setPlaceholder("e.g., Generate text based on cursor position.")
					.setValue(this.plugin.settings.cursorPrompt)
					.inputEl.addEventListener("blur", async () => {
						this.plugin.settings.cursorPrompt = textarea.getValue();
						await this.saveSettings();
					});
				textarea.inputEl.classList.add("wide-text-settings");
			});

		// Custom Commands Section
		containerEl.createEl("h3", { text: "Custom Commands" });
		containerEl.createEl("p", { text: "Add your own custom commands. Triggered with the prefix defined in the Command Prefix setting." });

		// Command Prefix setting
		new Setting(containerEl)
			.setName("Command Prefix")
			.setDesc("The prefix used to trigger custom commands (e.g., /, !, #)")
			.addText((text) => {
				text.setPlaceholder("/")
					.setValue(this.plugin.settings.commandPrefix)
					.inputEl.addEventListener("blur", async () => {
						this.plugin.settings.commandPrefix = text.getValue().charAt(0);
						await this.saveSettings();
						this.display();
					});
			});

		// Display existing commands
		this.plugin.settings.customCommands.forEach((command, index) => {
			new Setting(containerEl)
				.setName(`Command: ${command.keyword}`)
				.setDesc("Edit the command prompt.")
				.addText((text) => {
					text.setValue(command.keyword)
						.setPlaceholder("Command name")
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.customCommands[index].keyword = text.getValue();
							await this.saveSettings();
						});
				})
				.addTextArea((textarea) => {
					textarea.setValue(command.prompt)
						.setPlaceholder("Command prompt")
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.customCommands[index].prompt = textarea.getValue();
							await this.saveSettings();
						});
				})
				.addExtraButton((btn) =>
					btn
						.setIcon("trash")
						.setTooltip("Delete this command")
						.onClick(async () => {
							this.plugin.settings.customCommands.splice(index, 1);
							await this.saveSettings();
							this.display();
						})
				);
		});



		// Add new command button
		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("Add Command")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.customCommands.push({ keyword: "new_command", prompt: "" });
					await this.saveSettings();
					this.display();
				})
		);
	}
}
