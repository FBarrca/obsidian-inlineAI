// modules/WidgetExtension.ts
import { EditorState, StateEffect, StateField } from "@codemirror/state";

import {
	EditorView,
	Decoration,
	DecorationSet,
	WidgetType,
	placeholder,
	keymap,
} from "@codemirror/view";

import { setIcon } from "obsidian";
import { ChatApiManager } from "../api";

import { currentSelectionState, SelectionInfo } from "./SelectionState";
import {
	createSlashCommandHighlighter,
	slashCommandAutocompletion,
} from "./commands/source";
import InlineAIChatPlugin from "src/main";

// Some existing exports
export const commandEffect = StateEffect.define<null>();
export const dismissTooltipEffect = StateEffect.define<null>();
export const acceptTooltipEffect = StateEffect.define<null>();

class FloatingWidget extends WidgetType {
	private chatApiManager: ChatApiManager;
	private selectionInfo: SelectionInfo | null;
	private plugin: InlineAIChatPlugin;

	private outerEditorView: EditorView | null = null;

	private dom: HTMLElement;
	private innerDom: HTMLElement;

	private textFieldView?: EditorView;
	// Primary Action Buttons
	private submitButton!: HTMLButtonElement;
	private loaderElement!: HTMLElement;

	//Secondary Action Buttons
	private acceptButton!: HTMLButtonElement;
	private discardButton!: HTMLButtonElement;

	// Track the current index in message history for up/down navigation
	private messageHistoryIndex: number | null = null;

	// Store references to event listeners for cleanup
	private onClickOutside: ((event: MouseEvent) => void) | null = null;
	private onEscape: ((event: KeyboardEvent) => void) | null = null;
	private escapeWindows: Window[] = [];

	// Handlers to suppress Obsidian focusout/blur effects when interacting with the widget
	private onOuterEditorFocusOut: ((event: FocusEvent) => void) | null = null;
	private onOuterEditorBlur: ((event: FocusEvent) => void) | null = null;

	constructor(
		chatApiManager: ChatApiManager,
		selectionInfo: SelectionInfo | null,
		plugin: InlineAIChatPlugin,
	) {
		super();
		this.chatApiManager = chatApiManager;
		this.selectionInfo = selectionInfo;
		this.plugin = plugin;

		// Create main DOM structure using createEl
		this.dom = createEl("div", {
			cls: "cm-cursor-overlay",
			attr: { style: "user-select: none;" },
		});
		this.innerDom = this.dom.createEl("div", {
			cls: "cm-cursor-overlay-inner",
		});
	}

	/**
	 * Overriding toDOM(view: EditorView) instead of just toDOM().
	 */
	public override toDOM(view: EditorView): HTMLElement {
		// Capture the outer EditorView
		this.outerEditorView = view;

		this.createPencilIcon();
		this.createInputField();
		this.createSubmitButton();
		this.createLoader();

		setTimeout(() => {
			this.textFieldView?.focus();
		}, 0);

		// Setup "click outside" and "Escape" dismissal
		this.onClickOutside = (event: MouseEvent) => {
			if (!this.dom.contains(event.target as Node)) {
				this.dismissTooltip();
			}
		};

		// Escape key: listen on all windows
		this.onEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				this.dismissTooltip();
			}
		};

		// Always add to main window
		window.addEventListener("mousedown", this.onClickOutside);
		window.addEventListener("keydown", this.onEscape);

		// Try to add to all popout windows (if any)
		this.escapeWindows = [window];
		// @ts-ignore
		if (window.app && window.app.openPopouts instanceof Function) {
			// Obsidian 1.4+ openPopouts returns array of popout windows
			// @ts-ignore
			const popouts: Window[] = window.app.openPopouts();
			for (const popout of popouts) {
				try {
					popout.addEventListener("keydown", this.onEscape!);
					this.escapeWindows.push(popout);
				} catch (e) {
					// ignore
				}
			}
		} else if (
			(window as any).app &&
			Array.isArray((window as any).app?.workspace?.getWindows?.())
		) {
			// Legacy: app.workspace.getWindows() returns array of windows
			const popouts: Window[] = (
				window as any
			).app.workspace.getWindows();
			for (const popout of popouts) {
				try {
					popout.addEventListener("keydown", this.onEscape!);
					this.escapeWindows.push(popout);
				} catch (e) {
					// ignore
				}
			}
		}

		// Cleanup
		this.dom.addEventListener("destroy", () => {
			document.removeEventListener("mousedown", this.onClickOutside!);
			for (const win of this.escapeWindows) {
				try {
					win.removeEventListener("keydown", this.onEscape!);
				} catch (e) {
					// ignore
				}
			}
			this.escapeWindows = [];
		});

		// Add a body-level flag so we can style/coordinate behavior if needed
		document.body.classList.add("inlineai-widget-open");

		// Suppress Obsidian's code block preview toggle when focus moves
		// from the editor into our widget by swallowing focusout/blur on the
		// editor when the new focus is within the widget DOM.
		const editorRoot = this.outerEditorView.dom;
		this.onOuterEditorFocusOut = (evt: FocusEvent) => {
			const next = (evt.relatedTarget as Node) || document.activeElement;
			if (next && this.dom.contains(next)) {
				// Stop the event so Obsidian doesn't react to loss of focus
				evt.stopImmediatePropagation?.();
				evt.stopPropagation();
				// Do not preventDefault so the focus change to the widget works
			}
		};
		this.onOuterEditorBlur = (evt: FocusEvent) => {
			const next = (evt.relatedTarget as Node) || document.activeElement;
			if (next && this.dom.contains(next)) {
				evt.stopImmediatePropagation?.();
				evt.stopPropagation();
			}
		};
		// Use capture to intercept before other listeners
		editorRoot.addEventListener(
			"focusout",
			this.onOuterEditorFocusOut,
			true,
		);
		editorRoot.addEventListener("blur", this.onOuterEditorBlur, true);

		return this.dom;
	}

	/**
	 * Ensure interactions inside the widget do not move the outer editor
	 * selection or steal selection focus, which would cause Obsidian to
	 * re-render code blocks (e.g., mermaid) when the widget is open.
	 */
	public override ignoreEvent(event: Event): boolean {
		// Returning true tells CodeMirror to ignore events for selection/focus
		// updates in the outer editor when they originate from this widget.
		// This keeps the editor's selection anchored (e.g., inside a mermaid
		// code block) and prevents the block from rendering while the widget
		// is open and being interacted with.
		return true;
	}

	public override destroy(): void {
		this.textFieldView?.destroy();
		this.innerDom.empty();

		this.submitButton.remove();
		this.loaderElement.remove();

		if (this.acceptButton) this.acceptButton.remove();
		if (this.discardButton) this.discardButton.remove();

		// Remove flag/class
		document.body.classList.remove("inlineai-widget-open");

		// Remove focus suppression listeners if attached
		try {
			const editorRoot = this.outerEditorView?.dom;
			if (editorRoot && this.onOuterEditorFocusOut) {
				editorRoot.removeEventListener(
					"focusout",
					this.onOuterEditorFocusOut,
					true,
				);
			}
			if (editorRoot && this.onOuterEditorBlur) {
				editorRoot.removeEventListener(
					"blur",
					this.onOuterEditorBlur,
					true,
				);
			}
		} catch (e) {
			// ignore cleanup errors
		}
		this.onOuterEditorFocusOut = null;
		this.onOuterEditorBlur = null;

		this.textFieldView = undefined;
		this.outerEditorView = null;
		this.messageHistoryIndex = null;
	}

	private dismissTooltip() {
		if (this.outerEditorView) {
			this.outerEditorView.dispatch({
				effects: dismissTooltipEffect.of(null),
			});
		}
	}

	private createPencilIcon() {
		if (!this.innerDom.querySelector(".cm-pencil-icon")) {
			const icon = this.innerDom.createEl("div", {
				cls: "cm-pencil-icon",
			});
			setIcon(icon, "pencil");
		}
	}

	private createInputField() {
		const editorDom = this.innerDom.createEl("div", {
			cls: "cm-tooltip-editor",
			attr: { style: "user-select: text;" },
		});

		this.textFieldView = new EditorView({
			state: EditorState.create({
				doc: "",
				extensions: [
					// 1) Show a placeholder in the input field
					placeholder("Ask copilot"),
					// 2) Add key bindings (including default ones for typical editor commands)
					keymap.of([
						{
							key: "Enter",
							run: () => {
								this.submitAction();
								return true;
							},
							preventDefault: true,
						},
						{
							key: "Mod-a",
							run: (view) => {
								const doc = view.state.doc;
								view.dispatch({
									selection: { anchor: 0, head: doc.length },
								});
								return true;
							},
							preventDefault: true,
						},
						{
							key: "ArrowUp",
							run: () => {
								const messageHistory =
									this.chatApiManager.getMessageHistory();
								if (
									messageHistory.length === 0 ||
									!this.textFieldView
								) {
									return true;
								}

								// If not started, set to last index
								if (this.messageHistoryIndex === null) {
									this.messageHistoryIndex =
										messageHistory.length - 1;
								} else if (this.messageHistoryIndex > 0) {
									this.messageHistoryIndex--;
								}
								// Clamp to 0
								if (this.messageHistoryIndex < 0)
									this.messageHistoryIndex = 0;

								const msg =
									messageHistory[this.messageHistoryIndex]
										.userPrompt;
								this.textFieldView.dispatch({
									changes: {
										from: 0,
										to: this.textFieldView.state.doc.length,
										insert: msg,
									},
								});
								// Move cursor to end
								this.textFieldView.dispatch({
									selection: {
										anchor: msg.length,
										head: msg.length,
									},
								});
								return true;
							},
							preventDefault: true,
						},
						{
							key: "ArrowDown",
							run: () => {
								const messageHistory =
									this.chatApiManager.getMessageHistory();
								if (
									messageHistory.length === 0 ||
									!this.textFieldView
								) {
									return true;
								}
								if (this.messageHistoryIndex === null) {
									// Do nothing if not in history navigation
									return true;
								}
								if (
									this.messageHistoryIndex <
									messageHistory.length - 1
								) {
									this.messageHistoryIndex++;
									const msg =
										messageHistory[this.messageHistoryIndex]
											.userPrompt;
									this.textFieldView.dispatch({
										changes: {
											from: 0,
											to: this.textFieldView.state.doc
												.length,
											insert: msg,
										},
									});
									// Move cursor to end
									this.textFieldView.dispatch({
										selection: {
											anchor: msg.length,
											head: msg.length,
										},
									});
								} else {
									// If at the end, clear the field and exit history navigation
									this.messageHistoryIndex = null;
									this.textFieldView.dispatch({
										changes: {
											from: 0,
											to: this.textFieldView.state.doc
												.length,
											insert: "",
										},
									});
								}
								return true;
							},
							preventDefault: true,
						},
					]),

					// 3) Enable slash-command autocompletion
					slashCommandAutocompletion({
						prefix: this.plugin.settings.commandPrefix,
						customCommands: this.plugin.settings.customCommands,
					}),
					createSlashCommandHighlighter({
						prefix: this.plugin.settings.commandPrefix,
						customCommands: this.plugin.settings.customCommands,
					}),
				],
			}),
			parent: editorDom,
		});

		// Reset messageHistoryIndex when user types or changes input
		this.textFieldView.dom.addEventListener("input", () => {
			// Only reset if the input is not the result of an up/down navigation
			// (i.e., if the value doesn't match the current history entry)
			// But for simplicity, always reset if user types
			this.messageHistoryIndex = null;
		});
	}

	private createSubmitButton() {
		this.submitButton = this.innerDom.createEl("button", {
			cls: "submit-button tooltip-button",
			text: "Submit",
		});
		setIcon(this.submitButton, "send-horizontal");

		this.submitButton.onclick = () => {
			this.submitAction();
		};
	}

	private createLoader() {
		this.loaderElement = this.innerDom.createEl("div", { cls: "loader" });
		this.toggleLoading(false);
	}

	/**
	 * Handles the submit action by calling the AI with the user input and the selected text.
	 */
	private submitAction() {
		const userPrompt = this.textFieldView?.state.doc.toString() ?? "";

		if (!userPrompt.trim()) {
			console.warn("Empty input. Submission aborted.");
			return;
		}

		// Grab the selected text from the stored selection info
		const selectedText = this.selectionInfo?.text ?? "";

		// Show loader
		this.toggleLoading(true);

		this.chatApiManager
			.callSelection(userPrompt, selectedText)
			.then((aiResponse) => {
				this.showActionButtons();
			})
			.catch((error) => {
				console.error("Error calling AI:", error);
			})
			.finally(() => {
				// Hide loader
				this.toggleLoading(false);
			});

		// Reset message history navigation after submit
		this.messageHistoryIndex = null;
	}

	/**
	 * Toggles the visibility of the submit button and loader.
	 * @param isLoading - Whether to show the loader.
	 */
	private toggleLoading(isLoading: boolean) {
		if (isLoading) {
			this.submitButton.classList.add("hidden");
			this.loaderElement.classList.remove("hidden");
		} else {
			this.submitButton.classList.remove("hidden");
			this.loaderElement.classList.add("hidden");
		}
	}

	/**
	 * Transitions the widget to show Accept, Discard, and Reload buttons.
	 */
	private showActionButtons() {
		this.submitButton.classList.add("hidden");
		this.createAcceptButton();
		this.createDiscardButton();
	}

	/**
	 * Creates the Accept button.
	 */
	private createAcceptButton() {
		if (!this.acceptButton) {
			this.acceptButton = this.innerDom.createEl("button", {
				cls: "accept-button tooltip-button primary-action",
				text: "Accept",
			});
			setIcon(this.acceptButton, "check");

			this.acceptButton.onclick = () => {
				this.acceptAction();
			};

			this.innerDom.appendChild(this.acceptButton);
		}
	}

	/**
	 * Creates the Discard button.
	 */
	private createDiscardButton() {
		if (!this.discardButton) {
			this.discardButton = this.innerDom.createEl("button", {
				cls: "discard-button tooltip-button",
				text: "Discard",
			});
			setIcon(this.discardButton, "cross");

			this.discardButton.onclick = () => {
				this.discardAction();
			};

			this.innerDom.appendChild(this.discardButton);
		}
	}

	/**
	 * Handles the Accept action.
	 * Confirms the result, applies changes, and closes the tooltip.
	 */
	private acceptAction() {
		if (this.outerEditorView) {
			this.outerEditorView.dispatch({
				effects: acceptTooltipEffect.of(null),
			});
		}
		this.dismissTooltip();
	}

	private discardAction() {
		this.dismissTooltip();
	}
}

/**
 * Build decorations for the first non-empty selection range.
 */
function renderFloatingWidget(
	state: EditorState,
	chatApiManager: ChatApiManager,
	plugin: InlineAIChatPlugin,
): DecorationSet {
	const firstSelectedRange =
		state.selection.ranges.find((range) => !range.empty) ??
		state.selection.main;

	const selectionInfo = state.field(currentSelectionState, false) ?? null;

	const deco = Decoration.widget({
		widget: new FloatingWidget(chatApiManager, selectionInfo, plugin),
		above: true,
		inline: true,

		side: -1,
	}).range(firstSelectedRange.from);

	return Decoration.set([deco]);
}

/**
 * Defines the selection overlay field with access to ChatApiManager.
 */
/**
 * A StateField that manages the decoration set for the floating widget.
 *
 * When the user triggers the command, it re-renders the widget.
 * When the user dismisses the tooltip, it clears the decoration set.
 * Otherwise, it returns the existing decoration set.
 */
function FloatingTooltipState(
	chatApiManager: ChatApiManager,
	plugin: InlineAIChatPlugin,
) {
	return StateField.define<DecorationSet>({
		create(state) {
			return Decoration.none;
		},
		update(decorations, tr) {
			// Recompute if the user triggers the command
			if (tr.effects.some((e) => e.is(commandEffect))) {
				return renderFloatingWidget(tr.state, chatApiManager, plugin);
			}
			// Or dismiss it
			if (tr.effects.some((e) => e.is(dismissTooltipEffect))) {
				return Decoration.none;
			}
			// Otherwise, return the existing overlay
			return decorations;
		},
		provide: (field) => EditorView.decorations.from(field),
	});
}

/**
 * Extension enabling selection overlay widgets.
 */
export function FloatingTooltipExtension(
	chatApiManager: ChatApiManager,
	plugin: InlineAIChatPlugin,
) {
	return [FloatingTooltipState(chatApiManager, plugin)];
}
