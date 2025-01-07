// modules/WidgetExtension.ts
import {
    EditorState,
    StateEffect,
    StateField,
} from "@codemirror/state";

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

// Some existing exports
export const commandEffect = StateEffect.define<null>();
export const dismissTooltipEffect = StateEffect.define<null>();
export const acceptTooltipEffect = StateEffect.define<null>();

class FloatingWidget extends WidgetType {
    private chatApiManager: ChatApiManager;
    private selectionInfo: SelectionInfo | null;

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

    constructor(chatApiManager: ChatApiManager, selectionInfo: SelectionInfo | null) {
        super();
        this.chatApiManager = chatApiManager;
        this.selectionInfo = selectionInfo;

        // Create main DOM structure using createEl
        this.dom = createEl("div", { cls: "cm-cursor-overlay", attr: { style: "user-select: none;" } });
        this.innerDom = this.dom.createEl("div", { cls: "cm-cursor-overlay-inner" });
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
        const onClickOutside = (event: MouseEvent) => {
            if (!this.dom.contains(event.target as Node)) {
                this.dismissTooltip();
            }
        };

        const onEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                this.dismissTooltip();
            }
        };

        document.addEventListener("mousedown", onClickOutside);
        document.addEventListener("keydown", onEscape);

        // Cleanup
        this.dom.addEventListener("destroy", () => {
            document.removeEventListener("mousedown", onClickOutside);
            document.removeEventListener("keydown", onEscape);
        });

        return this.dom;
    }

    public override destroy(): void {
        this.textFieldView?.destroy();
        this.innerDom.empty();
        this.textFieldView = undefined;
        this.outerEditorView = null;
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
            const icon = this.innerDom.createEl("div", { cls: "cm-pencil-icon" });
            setIcon(icon, "pencil");
        }
    }

    private createInputField() {
        const editorDom = this.innerDom.createEl("div", { cls: "cm-tooltip-editor", attr: { style: "user-select: text;" } });

        this.textFieldView = new EditorView({
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
        this.loaderElement = this.innerDom.createEl("div", { cls: "loader", attr: { style: "display: none;" } });
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

    }

    /**
     * Toggles the visibility of the submit button and loader.
     * @param isLoading - Whether to show the loader.
     */
    private toggleLoading(isLoading: boolean) {
        this.submitButton.style.display = isLoading ? "none" : "flex";
        this.loaderElement.style.display = isLoading ? "flex" : "none";
    }


    /**
     * Transitions the widget to show Accept, Discard, and Reload buttons.
     */
    private showActionButtons() {
        this.submitButton.style.display = "none";
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
    chatApiManager: ChatApiManager
): DecorationSet {
    const firstSelectedRange = state.selection.ranges.find((range) => !range.empty) ?? state.selection.main;

    const selectionInfo = state.field(currentSelectionState, false) ?? null;

    const deco = Decoration.widget({
        widget: new FloatingWidget(chatApiManager, selectionInfo),
        above: true,
        inline: true,
        side: -9999,
    }).range(firstSelectedRange.from);

    return Decoration.set([deco]);
}

/**
 * Defines the selection overlay field with access to ChatApiManager.
 */
function FloatingTooltipState(chatApiManager: ChatApiManager) {
    return StateField.define<DecorationSet>({
        create(state) {
            return Decoration.none;
        },
        update(decorations, tr) {
            // Recompute if the user triggers the command
            if (tr.effects.some((e) => e.is(commandEffect))) {
                return renderFloatingWidget(tr.state, chatApiManager);
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
export function FloatingTooltipExtension(chatApiManager: ChatApiManager) {
    return [FloatingTooltipState(chatApiManager)];
}
