// main.ts
import { Plugin, MarkdownView, App } from "obsidian";
import { EditorView } from "@codemirror/view";
import { InlineAISettings, DEFAULT_SETTINGS, InlineAISettingsTab } from "./settings";
import { acceptTooltipEffect, commandEffect, dismissTooltipEffect, FloatingTooltipExtension } from "./modules/WidgetExtension";
import { ChatApiManager } from "./api";
import { generatedResponseState } from "./modules/AIExtension";
import { buildSelectionHiglightState, currentSelectionState, setSelectionInfoEffect } from "./modules/SelectionState";
import { diffExtension } from "./modules/diffExtension";

export default class InlineAIChatPlugin extends Plugin {
	settings: InlineAISettings = DEFAULT_SETTINGS;
	chatapi!: ChatApiManager;

	async onload() {
		await this.loadSettings();
		this.chatapi = new ChatApiManager(this.settings, this.app);

		this.registerEditorExtension([
			FloatingTooltipExtension(this.chatapi),
			generatedResponseState,
			currentSelectionState,
			buildSelectionHiglightState,
			diffExtension

		]);

		// Add command to show tooltip
		this.addCommand({
			id: "show-cursor-tooltip",
			name: "Show cursor tooltip",
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
			],
		});
		this.addCommand({
			id: "accept-tooltip",
			name: "Accept tooltip suggestion",
			callback: () => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					const cmEditor = (markdownView.editor as any).cm as EditorView;

					const response = cmEditor.state.field(generatedResponseState, false);
					if (response) {
						cmEditor.dispatch({
							effects: acceptTooltipEffect.of(null),
						});
						cmEditor.dispatch({
							effects: dismissTooltipEffect.of(null),
						});
					}
				}
			}

		});
		this.addCommand({
			id: "discard-tooltip",
			name: "Discard tooltip suggestion",
			callback: () => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					const cmEditor = (markdownView.editor as any).cm as EditorView;
					const response = cmEditor.state.field(generatedResponseState, false);
					if (response) {
						cmEditor.dispatch({
							effects: dismissTooltipEffect.of(null),
						});
					}
				}
			}

		});

		// Add settings tab
		this.addSettingTab(new InlineAISettingsTab(this.app, this));
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
