import { EditorView, placeholder, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import {
	ButtonComponent,
	setIcon,
	Notice,
	App,
	MarkdownView,
	EditorPosition,
} from "obsidian";
import { callApi } from "../api";

export class TooltipWidget {
	dom: HTMLDivElement;
	editorView: EditorView;
	submitButton: ButtonComponent;
	acceptButton: ButtonComponent;
	discardButton: ButtonComponent;
	reloadButton: ButtonComponent;
	loader: HTMLDivElement;
	selectedText: string;
	promptText: string;
	generatedText: string;
	diff: string;
	app: App;
	selectionRange: { from: EditorPosition; to: EditorPosition } | null;
	generatedTextRange: { from: EditorPosition; to: EditorPosition } | null;

	constructor(app: App, selectedText: string) {
		this.app = app;
		this.selectedText = selectedText;
		this.promptText = "";
		this.generatedText = "";
		this.diff = "";
		this.selectionRange = null;
		this.generatedTextRange = null;

		this.dom = document.createElement("div");
		this.dom.className = "cm-tooltip";
		setIcon(this.dom, "pencil");

		// First Stage: Prompt Editor
		const editorDom = document.createElement("div");
		editorDom.className = "cm-tooltip-editor";
		this.dom.appendChild(editorDom);

		this.editorView = new EditorView({
			state: EditorState.create({
				doc: "",
				extensions: [
					placeholder("Ask copilot"),
					keymap.of([
						{
							key: "Enter",
							run: () => {
								this.submitAction();
								return true;
							},
							preventDefault: true,
						},
					]),
				],
			}),
			parent: editorDom,
		});

		// Buttons
		this.submitButton = this.createButton(
			"",
			"submit-button tooltip-button",
			() => this.submitAction()
		);
		setIcon(this.submitButton.buttonEl, "send-horizontal");

		this.loader = document.createElement("div");
		this.loader.className = "loader";
		this.loader.style.display = "none";
		this.dom.appendChild(this.loader);

		this.acceptButton = this.createButton(
			"Accept",
			"accept-button tooltip-button",
			() => this.acceptAction()
		);
		this.acceptButton.buttonEl.style.display = "none";

		this.discardButton = this.createButton(
			"Discard",
			"discard-button tooltip-button",
			() => this.discardAction()
		);
		this.discardButton.buttonEl.style.display = "none";

		this.reloadButton = this.createButton(
			"",
			"submit-button reload-button tooltip-button",
			() => this.reloadAction()
		);
		setIcon(this.reloadButton.buttonEl, "rotate-cw");
		this.reloadButton.buttonEl.style.display = "none";

		this.editorView.requestMeasure({
			read: () => {
				this.editorView.dom.style.height = "100%";
				this.editorView.dom.style.width = "100%";
			},
		});
	}

	/**
	 * Helper method to create a button with specified properties.
	 * @param text - The text to display on the button.
	 * @param classNames - Space-separated list of CSS class names.
	 * @param onClick - The callback function to execute on button click.
	 * @returns A ButtonComponent instance.
	 */
	private createButton(
		text: string,
		classNames: string,
		onClick: () => void
	): ButtonComponent {
		const button = new ButtonComponent(this.dom);
		classNames
			.split(" ")
			.forEach((cls) => button.buttonEl.classList.add(cls));
		if (text) {
			button.setButtonText(text);
		}
		button.setTooltip(text || "Reload");
		button.onClick(onClick);
		return button;
	}

	/**
	 * Handles the submit action when the user submits their prompt.
	 */
	private async submitAction(): Promise<void> {
		const userInput = this.editorView.state.doc.toString();
		this.promptText = userInput;
		console.log("Selected Text:", this.selectedText);

		this.submitButton.setDisabled(true);
		this.submitButton.buttonEl.style.display = "none";
		this.loader.style.display = "block";

		try {
			const response = await callApi(userInput, this.selectedText, (this.app as any).plugins.getPlugin("sample-plugin").settings);
			this.generatedText = response.generated;
			this.diff = response.diff;

			// Automatically paste the diff into the editor
			const markdownView =
				this.app.workspace.getActiveViewOfType(MarkdownView);
			if (markdownView) {
				const editor = markdownView.editor;
				// Save the current selection range
				const from = editor.getCursor("from");
				const to = editor.getCursor("to");
				this.selectionRange = { from: { ...from }, to: { ...to } };

				// Replace the selection with the diff
				editor.replaceSelection(this.diff);

				// After replacement, get the new cursor position
				const endPos = editor.getCursor();
				this.generatedTextRange = {
					from: { ...from },
					to: { ...endPos },
				};
			} else {
				new Notice("Failed to find the active Markdown editor.");
			}

			// Transition to second stage
			this.editorView.dom.style.display = "none";
			this.loader.style.display = "none";
			this.acceptButton.buttonEl.style.display = "block";
			this.discardButton.buttonEl.style.display = "block";
			this.reloadButton.buttonEl.style.display = "block";
		} catch (error) {
			new Notice("Error: " + (error as Error).message);
			this.submitButton.setDisabled(false);
			this.submitButton.buttonEl.style.display = "block";
			this.loader.style.display = "none";
		}
	}

	/**
	 * Handles the accept action, allowing the user to accept the generated text.
	 */
	private acceptAction(): void {
		const markdownView =
			this.app.workspace.getActiveViewOfType(MarkdownView);
		if (markdownView && this.generatedTextRange) {
			const editor = markdownView.editor;
			// Replace the diff with the generated text
			editor.replaceRange(
				this.generatedText,
				this.generatedTextRange.from,
				this.generatedTextRange.to
			);
		} else {
			new Notice("Failed to find the active Markdown editor.");
		}
		this.destroy();
	}

	/**
	 * Handles the discard action, allowing the user to discard the generated text.
	 */
	private discardAction(): void {
		const markdownView =
			this.app.workspace.getActiveViewOfType(MarkdownView);
		if (markdownView && this.generatedTextRange) {
			const editor = markdownView.editor;
			// Replace the diff with the original selected text
			editor.replaceRange(
				this.selectedText,
				this.generatedTextRange.from,
				this.generatedTextRange.to
			);
		} else {
			new Notice("Failed to find the active Markdown editor.");
		}
		this.destroy();
	}

	/**
	 * Handles the reload action, re-fetching the generated text and updating the editor.
	 */
	private async reloadAction(): Promise<void> {
		// Step 1: Disable the reload button and show the loader
		this.reloadButton.setDisabled(true);
		this.loader.style.display = "block";
		this.reloadButton.buttonEl.style.display = "none";

		// Step 2: Hide the accept and discard buttons
		this.acceptButton.buttonEl.style.display = "none";
		this.discardButton.buttonEl.style.display = "none";

		const markdownView =
			this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView || !this.generatedTextRange) {
			new Notice("Failed to find the active Markdown editor.");
			// Re-enable the reload button and hide the loader
			this.reloadButton.setDisabled(false);
			this.loader.style.display = "none";
			this.reloadButton.buttonEl.style.display = "block";
			// Re-show the accept and discard buttons in case of failure
			this.acceptButton.buttonEl.style.display = "block";
			this.discardButton.buttonEl.style.display = "block";
			return;
		}

		const editor = markdownView.editor;

		// Step 3: Restore the original selected text
		editor.replaceRange(
			this.selectedText,
			this.generatedTextRange.from,
			this.generatedTextRange.to
		);

		// Step 4: Update the generatedTextRange to the original selection range
		if (this.selectionRange) {
			this.generatedTextRange = {
				from: { ...this.selectionRange.from },
				to: { ...this.selectionRange.to },
			};
		}

		try {
			const userInput = this.editorView.state.doc.toString();
			this.promptText = userInput;
			// Step 5: Call the API to get the new generated text
			const response = await callApi(this.promptText, this.selectedText, (this.app as any).plugins.getPlugin("sample-plugin").settings);
			this.generatedText = response.generated;
			this.diff = response.diff;

			// Step 6: Replace the original text with the new diff
			editor.replaceRange(
				this.diff,
				this.generatedTextRange.from,
				this.generatedTextRange.to
			);

			// Step 7: Update the generatedTextRange to the new diff's range
			const newLines = this.diff.split("\n").length;
			const lastLineLength = this.diff.split("\n").pop()!.length;

			this.generatedTextRange.to = {
				line: this.generatedTextRange.from.line + newLines - 1,
				ch:
					newLines === 1
						? this.generatedTextRange.from.ch + this.diff.length
						: lastLineLength,
			};
		} catch (error) {
			// Step 8: Handle any errors that occur during the API call
			new Notice("Error: " + (error as Error).message);
			// Optionally, you might want to restore the original text if desired
			// editor.replaceRange(this.selectedText, this.generatedTextRange.from, this.generatedTextRange.to);
		} finally {
			// Step 9: Re-enable the reload button and hide the loader
			this.reloadButton.setDisabled(false);
			this.loader.style.display = "none";
			this.reloadButton.buttonEl.style.display = "block";

			// Step 10: Re-show the accept and discard buttons after reload completes
			this.acceptButton.buttonEl.style.display = "block";
			this.discardButton.buttonEl.style.display = "block";
		}
	}

	/**
	 * Destroys the tooltip widget, cleaning up the DOM and editor view.
	 */
	destroy(): void {
		this.editorView.destroy();
		this.dom.remove();
	}

	/**
	 * Mounts the tooltip widget, focusing the editor.
	 */
	mount(): void {
		setTimeout(() => {
			this.editorView.focus();
		}, 0);
	}
}
