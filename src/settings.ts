import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import MyPlugin from "./main";
import { cursorPrompt, selectionPrompt } from "./default_prompts";
import { SlashCommand, BUILT_IN_COMMANDS } from "./modules/commands/source";
import { startCodexOAuthFlow } from "./codex-auth";
import {
	clearCodexTokens,
	getApiKey,
	getCodexTokens,
	isSecretStorageAvailable,
	setApiKey,
	setCodexTokens,
} from "./credentials";

// Interface for the settings
export interface InlineAISettings {
	provider: "openai" | "ollama" | "custom" | "gemini" | "azure" | "codex";
	model: string;
	customURL?: string;
	azureEndpoint?: string;
	azureApiVersion?: string;
	selectionPrompt: string;
	cursorPrompt: string;
	customCommands: SlashCommand[];
	commandPrefix: string;
	messageHistory: boolean;
}

// Default settings values
export const DEFAULT_SETTINGS: InlineAISettings = {
	provider: "ollama",
	model: "llama3.2",
	customURL: "",
	azureEndpoint: "",
	azureApiVersion: "2024-02-15-preview",
	selectionPrompt: selectionPrompt,
	cursorPrompt: cursorPrompt,
	customCommands: [],
	commandPrefix: "/",
	messageHistory: false,
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

		if (!isSecretStorageAvailable(this.app)) {
			containerEl.createEl("p", {
				text: "⚠️ InlineAI requires Obsidian 1.11.4 or later for secure credential storage. Please update Obsidian to use API keys and Codex sign-in.",
				cls: "setting-item-description",
			});
		}

		// Provider setting
		new Setting(containerEl)
			.setName("Provider")
			.setDesc(
				"Choose between OpenAI, Ollama, Azure OpenAI, Gemini, a custom OpenAI-compatible endpoint, or Codex (ChatGPT subscription).",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("openai", "OpenAI")
					.addOption("ollama", "Ollama")
					.addOption("azure", "Azure OpenAI")
					.addOption("gemini", "Gemini")
					.addOption("custom", "Custom/OpenAI-compatible")
					.addOption("codex", "Codex (ChatGPT subscription)")
					.setValue(this.plugin.settings.provider)
					.onChange(async (value) => {
						const CODEX_MODEL_IDS = [
							"gpt-5.5",
							"gpt-5.4-mini",
							"gpt-5.3-codex-spark",
							"gpt-5.2-codex",
							"gpt-5.1-codex",
							"gpt-5.1-codex-max",
							"codex-mini-latest",
						];
						this.plugin.settings.provider = value as
							| "openai"
							| "ollama"
							| "azure"
							| "custom"
							| "gemini"
							| "codex";
						// Reset model to a sane default when switching to Codex
						if (
							value === "codex" &&
							!CODEX_MODEL_IDS.includes(
								this.plugin.settings.model,
							)
						) {
							this.plugin.settings.model = "gpt-5.4-mini";
						}
						await this.saveSettings();
						this.display();
					}),
			);

		// Codex subscription auth section
		if (this.plugin.settings.provider === "codex") {
			const codexTokens = getCodexTokens(this.app);
			const isSignedIn = !!(
				codexTokens?.access && codexTokens?.accountId
			);

			new Setting(containerEl)
				.setName("ChatGPT account")
				.setDesc(
					isSignedIn
						? `Signed in (account: ${codexTokens!.accountId})`
						: "Not signed in — click to authenticate with your ChatGPT Plus/Pro subscription.",
				)
				.addButton((btn) => {
					btn.setButtonText(
						isSignedIn ? "Sign out" : "Sign in with ChatGPT",
					)
						.setCta()
						.onClick(async () => {
							if (isSignedIn) {
								clearCodexTokens(this.app);
								this.display();
							} else {
								if (!isSecretStorageAvailable(this.app)) {
									new Notice(
										"⚠️ InlineAI requires Obsidian 1.11.4+ for Codex sign-in.",
									);
									return;
								}
								new Notice(
									"Opening browser for ChatGPT sign-in…",
								);
								const tokens = await startCodexOAuthFlow();
								if (tokens) {
									setCodexTokens(this.app, tokens);
									new Notice(
										"✅ Codex: signed in successfully",
									);
									this.display();
								}
							}
						});
				});

			if (isSignedIn) {
				containerEl.createEl("p", {
					text: "Credentials are stored in Obsidian's keychain (Settings → Security). They are not synced with your vault and must be set up on each device.",
					cls: "setting-item-description",
				});
			}
		}

		// Model setting
		if (this.plugin.settings.provider === "codex") {
			const CODEX_MODELS: {
				value: string;
				label: string;
				desc: string;
			}[] = [
				{
					value: "gpt-5.5",
					label: "GPT-5.5",
					desc: "Most capable — best for complex rewrites and reasoning",
				},
				{
					value: "gpt-5.4-mini",
					label: "GPT-5.4 mini ✦ recommended",
					desc: "Fast and cost-efficient — ideal for inline edits",
				},
				{
					value: "gpt-5.3-codex-spark",
					label: "GPT-5.3 Codex Spark (Pro only)",
					desc: "Near-instant iteration — requires ChatGPT Pro",
				},
				{
					value: "gpt-5.2-codex",
					label: "GPT-5.2 Codex",
					desc: "Strong coding and structured writing",
				},
				{
					value: "gpt-5.1-codex",
					label: "GPT-5.1 Codex",
					desc: "Balanced coding model",
				},
				{
					value: "gpt-5.1-codex-max",
					label: "GPT-5.1 Codex Max",
					desc: "High-effort variant of GPT-5.1 Codex",
				},
				{
					value: "codex-mini-latest",
					label: "Codex Mini",
					desc: "Lightest and fastest option",
				},
				{
					value: "custom",
					label: "Custom…",
					desc: "Enter a model ID manually",
				},
			];
			const isCustom = !CODEX_MODELS.some(
				(m) =>
					m.value === this.plugin.settings.model &&
					m.value !== "custom",
			);
			const dropdownValue = isCustom
				? "custom"
				: this.plugin.settings.model;
			const selectedModel = CODEX_MODELS.find(
				(m) => m.value === dropdownValue,
			);

			new Setting(containerEl)
				.setName("Model")
				.setDesc(
					selectedModel?.desc ??
						"Select the model to use for Codex requests.",
				)
				.addDropdown((dd) => {
					CODEX_MODELS.forEach((m) => dd.addOption(m.value, m.label));
					dd.setValue(dropdownValue).onChange(async (value) => {
						this.plugin.settings.model =
							value === "custom" ? "" : value;
						await this.saveSettings();
						this.display();
					});
				});

			if (isCustom || dropdownValue === "custom") {
				new Setting(containerEl)
					.setName("Custom model ID")
					.setDesc(
						"Enter the exact model ID as used by the Codex API.",
					)
					.addText((text) => {
						text.setPlaceholder("e.g., gpt-5.1-codex")
							.setValue(
								isCustom ? this.plugin.settings.model : "",
							)
							.inputEl.addEventListener("blur", async () => {
								this.plugin.settings.model = text
									.getValue()
									.trim();
								await this.saveSettings();
								this.display();
							});
					});
				if (!this.plugin.settings.model.trim()) {
					containerEl.createEl("p", {
						text: "⚠️ No model ID entered — requests will fail until you set one.",
						cls: "setting-item-description",
					});
				}
			}
		} else {
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
		}

		// API Key setting (conditionally displayed for OpenAI-supported endpoints)
		if (
			this.plugin.settings.provider === "openai" ||
			this.plugin.settings.provider === "custom" ||
			this.plugin.settings.provider === "gemini" ||
			this.plugin.settings.provider === "azure"
		) {
			new Setting(containerEl)
				.setName("API key")
				.setDesc("Enter your API key.")
				.addText((text) => {
					text.setPlaceholder("sk-...")
						.setValue(getApiKey(this.app) ?? "")
						.inputEl.addEventListener("blur", async () => {
							if (!isSecretStorageAvailable(this.app)) {
								new Notice(
									"⚠️ InlineAI requires Obsidian 1.11.4+ to store API keys securely.",
								);
								return;
							}
							setApiKey(this.app, text.getValue());
							this.plugin.chatapi.updateSettings(
								this.plugin.settings,
							);
						});
				});
		}

		// Custom endpoint setting (only for "custom" provider)
		if (this.plugin.settings.provider === "custom") {
			new Setting(containerEl)
				.setName("Custom endpoint")
				.setDesc(
					"Enter your OpenAI-compatible base URL (e.g. https://api.groq.com/openai/v1).",
				)
				.addText((text) => {
					text.setPlaceholder("https://api.mycustomhost.com/v1")
						.setValue(this.plugin.settings.customURL || "")
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.customURL = text.getValue();
							await this.saveSettings();
						});
				});
		}

		// Azure-specific settings
		if (this.plugin.settings.provider === "azure") {
			// Azure endpoint setting
			new Setting(containerEl)
				.setName("Azure endpoint")
				.setDesc(
					"Enter your Azure OpenAI endpoint URL (e.g. https://your-resource.openai.azure.com).",
				)
				.addText((text) => {
					text.setPlaceholder(
						"https://your-resource.openai.azure.com",
					)
						.setValue(this.plugin.settings.azureEndpoint || "")
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.azureEndpoint = text
								.getValue()
								.trim();
							await this.saveSettings();
						});
				});

			// Azure API version setting
			new Setting(containerEl)
				.setName("Azure API version")
				.setDesc("Enter the Azure OpenAI API version to use.")
				.addText((text) => {
					text.setPlaceholder("2024-02-15-preview")
						.setValue(
							this.plugin.settings.azureApiVersion ||
								"2024-02-15-preview",
						)
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.azureApiVersion = text
								.getValue()
								.trim();
							await this.saveSettings();
						});
				});
		}

		// Advanced Section
		containerEl.createEl("h3", { text: "Advanced" });
		// Selection Prompt setting
		new Setting(containerEl)
			.setName("Selection prompt")
			.setDesc(
				"System Prompt used when the tooltip is triggered with selected text.",
			)
			.addTextArea((textarea) => {
				textarea
					.setPlaceholder("e.g., Summarize the selected text.")
					.setValue(this.plugin.settings.selectionPrompt)
					.inputEl.addEventListener("blur", async () => {
						this.plugin.settings.selectionPrompt =
							textarea.getValue();
						await this.saveSettings();
					});
				textarea.inputEl.classList.add("wide-text-settings");
			});

		// Cursor Prompt setting
		new Setting(containerEl)
			.setName("Cursor prompt")
			.setDesc(
				"System Prompt used when the tooltip is triggered with selected text.",
			)
			.addTextArea((textarea) => {
				textarea
					.setPlaceholder(
						"e.g., Generate text based on cursor position.",
					)
					.setValue(this.plugin.settings.cursorPrompt)
					.inputEl.addEventListener("blur", async () => {
						this.plugin.settings.cursorPrompt = textarea.getValue();
						await this.saveSettings();
					});
				textarea.inputEl.classList.add("wide-text-settings");
			});

		// Message History setting
		new Setting(containerEl)
			.setName("Message History")
			.setDesc(
				"Enable message history, you can navigate through the history using the up/down arrow keys.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.messageHistory)
					.onChange(async (value) => {
						this.plugin.settings.messageHistory = value;
						await this.saveSettings();
					});
			});

		// Custom Commands Section
		containerEl.createEl("h3", { text: "Custom Commands" });
		containerEl.createEl("p", {
			text: "Add your own custom commands. Triggered with the prefix defined in the Command Prefix setting.",
		});
		containerEl.createEl("p", {
			text: `Built-in: ${BUILT_IN_COMMANDS.map((c) => this.plugin.settings.commandPrefix + c.keyword).join("  •  ")}`,
			cls: "setting-item-description",
		});

		// Command Prefix setting
		new Setting(containerEl)
			.setName("Command Prefix")
			.setDesc(
				"The prefix used to trigger custom commands (e.g., /, !, #)",
			)
			.addText((text) => {
				text.setPlaceholder("/")
					.setValue(this.plugin.settings.commandPrefix)
					.inputEl.addEventListener("blur", async () => {
						this.plugin.settings.commandPrefix = text
							.getValue()
							.charAt(0);
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
							this.plugin.settings.customCommands[index].keyword =
								text.getValue();
							await this.saveSettings();
						});
				})
				.addTextArea((textarea) => {
					textarea
						.setValue(command.prompt)
						.setPlaceholder("Command prompt")
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.customCommands[index].prompt =
								textarea.getValue();
							await this.saveSettings();
						});
				})
				.addExtraButton((btn) =>
					btn
						.setIcon("trash")
						.setTooltip("Delete this command")
						.onClick(async () => {
							this.plugin.settings.customCommands.splice(
								index,
								1,
							);
							await this.saveSettings();
							this.display();
						}),
				);
		});

		// Add new command button
		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("Add Command")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.customCommands.push({
						keyword: "new_command",
						prompt: "",
					});
					await this.saveSettings();
					this.display();
				}),
		);
	}
}
