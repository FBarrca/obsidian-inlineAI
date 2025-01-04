// main.ts
import { Plugin, MarkdownView, App } from "obsidian";
import { EditorView } from "@codemirror/view";
import { MyPluginSettings, DEFAULT_SETTINGS, MyPluginSettingTab } from "./settings";
import { commandEffect, FloatingTooltipExtension } from "./modules/WidgetExtension";
import { ChatApiManager } from "./api";
import { AIResponseField } from "./modules/AIExtension";
import { buildSelectionHiglightState, currentSelectionState, setSelectionInfoEffect } from "./modules/SelectionSate";
import { diffExtension, diffDecorationState } from "./modules/diffExtension";

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		const chatapi = new ChatApiManager(this.settings, this.app);

		this.registerEditorExtension([
			FloatingTooltipExtension(chatapi),
			AIResponseField,
			currentSelectionState,
			buildSelectionHiglightState,
			diffExtension

		]);

		// Add command to show tooltip
		this.addCommand({
			id: "show-cursor-tooltip",
			name: "Show Cursor Tooltip",
			callback: () => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					const cmEditor = (markdownView.editor as any).cm as EditorView;

					// Grab the main selection range
					const { from, to } = cmEditor.state.selection.main;
					const effects = [];

					if (from !== to) {
						// If there is a real selection, store it
						const selectedText = cmEditor.state.doc.sliceString(from, to);
						effects.push(
							setSelectionInfoEffect.of({ from, to, text: selectedText })
						);
					} else {
						// If no selection, you could clear it or do nothing
						effects.push(setSelectionInfoEffect.of(null));
					}

					// Also trigger the overlay
					effects.push(commandEffect.of(null));

					// Dispatch all effects in one go
					cmEditor.dispatch({ effects });
				}
			},
			hotkeys: [
				{
					modifiers: ["Mod"],
					key: "a",
				},
			],
		});


		// Add settings tab
		this.addSettingTab(new MyPluginSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup if necessary
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
