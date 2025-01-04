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

import { selectionInfoField, SelectionInfo } from "./SelectionSate";

// Some existing exports
export const commandEffect = StateEffect.define<null>();
export const dismmisTooltipEffect = StateEffect.define<null>();
export const acceptTooltipEffect = StateEffect.define<null>();
export const discardTooltipEffect = StateEffect.define<null>();
export const reloadTooltipEffect = StateEffect.define<null>();

class CursorOverlayWidget extends WidgetType {
    private chatApiManager: ChatApiManager;
    private selectionInfo: SelectionInfo | null;

    private outerEditorView: EditorView | null = null;

    private dom = document.createElement("div");
    private innerDom = document.createElement("div");

    private textFieldView?: EditorView;
    private submitButton!: HTMLButtonElement;
    private loaderElement!: HTMLElement;

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
        console.log("CursorOverlayWidget destroyed");
        this.textFieldView?.destroy();
        this.innerDom.innerHTML = "";
        this.textFieldView = undefined;
        this.outerEditorView = null;
    }

    private dismissTooltip() {
        if (this.outerEditorView) {
            this.outerEditorView.dispatch({
                effects: dismmisTooltipEffect.of(null),
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
        console.log("User Input:", userPrompt);

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
                // we dont use it here as we are dispatching the effect from the method
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
}

/**
 * Build decorations for the first non-empty selection range.
 * Also obtains the entire selection info from the state
 * and passes it to the CursorOverlayWidget constructor.
 */
function getSelectionOverlayDecorations(
    state: EditorState,
    chatApiManager: ChatApiManager
): DecorationSet {
    // If there's no actual selection, bail out
    const firstSelectedRange = state.selection.ranges.find((range) => !range.empty);
    if (!firstSelectedRange) return Decoration.none;

    // Get the entire SelectionInfo (which includes the text)
    const selectionInfo = state.field(selectionInfoField, false) ?? null;

    // Create the widget decoration at the selection start (or end)
    const deco = Decoration.widget({
        widget: new CursorOverlayWidget(chatApiManager, selectionInfo),
        above: true,
        inline: false,
    }).range(firstSelectedRange.from);

    return Decoration.set([deco]);
}

/**
 * Defines the selection overlay field with access to ChatApiManager.
 */
function TooltipFiled(chatApiManager: ChatApiManager) {
    return StateField.define<DecorationSet>({
        create(state) {
            return getSelectionOverlayDecorations(state, chatApiManager);
        },
        update(decorations, tr) {
            // Recompute if the user triggers the command
            if (tr.effects.some((e) => e.is(commandEffect))) {
                return getSelectionOverlayDecorations(tr.state, chatApiManager);
            }
            // Or dismiss it
            if (tr.effects.some((e) => e.is(dismmisTooltipEffect))) {
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
export function selectionOverlayWidget(chatApiManager: ChatApiManager) {
    return [TooltipFiled(chatApiManager)];
}
