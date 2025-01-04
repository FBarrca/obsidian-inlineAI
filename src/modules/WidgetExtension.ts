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

import { currentSelectionState, SelectionInfo } from "./SelectionSate";

// Some existing exports
export const commandEffect = StateEffect.define<null>();
export const dismissTooltipEffect = StateEffect.define<null>();
export const acceptTooltipEffect = StateEffect.define<null>();

class FloatingWidget extends WidgetType {
    private chatApiManager: ChatApiManager;
    private selectionInfo: SelectionInfo | null;

    private outerEditorView: EditorView | null = null;

    private dom = document.createElement("div");
    private innerDom = document.createElement("div");

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
        this.dom.className = "cm-cursor-overlay";
        this.dom.style.userSelect = "none";
        this.innerDom.className = "cm-cursor-overlay-inner";
        this.dom.appendChild(this.innerDom);
    }

    /**
     * IMPORTANT:
     * Overriding toDOM(view: EditorView) instead of just toDOM().
     * This gives us a reference to the **outer** EditorView that
     * is rendering this widget decoration.
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
        this.innerDom.innerHTML = "";
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
            const icon = document.createElement("div");
            icon.className = "cm-pencil-icon";
            this.innerDom.appendChild(icon);
            setIcon(icon, "pencil");
        }
    }

    private createInputField() {
        const editorDom = document.createElement("div");
        editorDom.className = "cm-tooltip-editor";
        editorDom.style.userSelect = "text";
        this.innerDom.appendChild(editorDom);

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
        this.submitButton = document.createElement("button");
        this.submitButton.textContent = "Submit";
        this.submitButton.className = "submit-button tooltip-button";
        setIcon(this.submitButton, "send-horizontal");

        this.submitButton.onclick = () => {
            this.submitAction();
        };
        this.innerDom.appendChild(this.submitButton);
    }

    private createLoader() {
        this.loaderElement = document.createElement("div");
        this.loaderElement.className = "loader";
        this.loaderElement.style.display = "none";
        this.innerDom.appendChild(this.loaderElement);
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
                // Optionally handle or display aiResponse
                // For this implementation, we'll assume the AI response is handled via state effects
                // and we'll transition to the action buttons stage.
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
        if (isLoading) {
            this.submitButton.style.display = "none";
            this.loaderElement.style.display = "flex";
        } else {
            this.submitButton.style.display = "inline-block";
            this.loaderElement.style.display = "none";
        }
    }

    /**
     * Transitions the widget to show Accept, Discard, and Reload buttons.
     */
    private showActionButtons() {
        // Clear existing inner content
        this.submitButton.style.display = "none";

        // Create Accept, Discard, and Reload buttons
        this.createAcceptButton();
        this.createDiscardButton();
    }

    /**
     * Creates the Accept button.
     */
    private createAcceptButton() {
        if (!this.acceptButton) {
            this.acceptButton = document.createElement("button");
            this.acceptButton.textContent = "Accept";
            this.acceptButton.className = "accept-button tooltip-button primary-action";
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
            this.discardButton = document.createElement("button");
            this.discardButton.textContent = "Discard";
            this.discardButton.className = "discard-button tooltip-button neutral-action";
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
 * Also obtains the entire selection info from the state
 * and passes it to the CursorOverlayWidget constructor.
 */
function renderFloatingWidget(
    state: EditorState,
    chatApiManager: ChatApiManager
): DecorationSet {
    // If there's no actual selection, bail out
    const firstSelectedRange = state.selection.ranges.find((range) => !range.empty);
    if (!firstSelectedRange) return Decoration.none;

    // Get the entire SelectionInfo (which includes the text)
    const selectionInfo = state.field(currentSelectionState, false) ?? null;

    // Create the widget decoration at the selection start (or end)
    const deco = Decoration.widget({
        widget: new FloatingWidget(chatApiManager, selectionInfo),
        above: true,
        inline: false,
    }).range(firstSelectedRange.from);

    return Decoration.set([deco]);
}

/**
 * Defines the selection overlay field with access to ChatApiManager.
 */
function FloatingTooltipState(chatApiManager: ChatApiManager) {
    return StateField.define<DecorationSet>({
        create(state) {
            return renderFloatingWidget(state, chatApiManager);
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
