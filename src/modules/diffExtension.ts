// modules/diffExtension.ts
import {
    EditorState,
    StateField,
    RangeSetBuilder,
} from "@codemirror/state";
import {
    Decoration,
    DecorationSet,
    EditorView,
    WidgetType,
    ViewPlugin,
    ViewUpdate,
} from "@codemirror/view";
import DiffMatchPatch from "diff-match-patch";

import { acceptTooltipEffect, dismissTooltipEffect } from "./WidgetExtension";
import { generatedResponseState, setGeneratedResponseEffect } from "./AIExtension";
import { currentSelectionState } from "./SelectionSate";

/**
 * Widget to display added or removed content.
 * Improves accessibility by using appropriate ARIA attributes.
 */
class ChangeContentWidget extends WidgetType {
    constructor(
        private readonly content: string,
        private readonly type: 'added' | 'removed'
    ) {
        super();
    }

    toDOM(): HTMLElement {
        const wrapper = document.createElement("span");
        wrapper.className = `cm-change-widget cm-change-${this.type}`;
        wrapper.textContent = this.content;

        // Accessibility: Provide ARIA label
        wrapper.setAttribute(
            "aria-label",
            this.type === 'added' ? "Added content" : "Removed content"
        );
        return wrapper;
    }

    ignoreEvent(): boolean {
        // Decide whether to ignore events on the widget
        return false;
    }
}

/**
 * Generates a DecorationSet representing the diff between AI response and context,
 * using diff_match_patch with semantic cleanup.
 * @param state - The current editor state.
 * @returns A DecorationSet with the appropriate widgets.
 */
function generateDiffView(state: EditorState): DecorationSet {
    try {
        // Retrieve the AI response and the current context text from the state
        const response = state.field(generatedResponseState);
        const context = state.field(currentSelectionState);

        const aiText: string = response?.airesponse ?? "";
        const contextText: string = context?.text ?? "";

        // Debugging: Remove or conditionally enable in production
        console.debug("Generating diff view", {
            aiResponse: response,
            contextText: context,
        });

        // Use diff_match_patch instead of diffWords
        const dmp = new DiffMatchPatch();
        let diffs = dmp.diff_main(contextText, aiText);

        // Perform semantic cleanup
        dmp.diff_cleanupSemantic(diffs);

        // Initialize RangeSetBuilder for efficient decoration construction
        const builder = new RangeSetBuilder<Decoration>();
        let currentPos = context?.from ?? 0;


        diffs.forEach(([op, text]) => {
            const length = text.length;

            if (op === DiffMatchPatch.DIFF_INSERT) {
                // AI text added
                const widget = new ChangeContentWidget(text, "added");
                builder.add(
                    currentPos,
                    currentPos,
                    Decoration.widget({ widget, side: 1 })
                );
            } else if (op === DiffMatchPatch.DIFF_DELETE) {
                // Context text removed
                const widget = new ChangeContentWidget(text, "removed");
                // Attach the widget over the removed range
                builder.add(
                    currentPos,
                    currentPos + length,
                    Decoration.widget({ widget, side: -1 })
                );
                currentPos += length;
            } else {
                // No change, move currentPos forward
                currentPos += length;
            }
        });

        return builder.finish();
    } catch (error) {
        console.error("Error generating diff view:", error);
        return Decoration.none;
    }
}

/**
 * This function takes the current editor state and the view, and applies the AI-suggested changes.
 *
 * @param state - The current editor state.
 * @param view - The EditorView instance.
 */
function dispatchAIChanges(state: EditorState, view: EditorView): void {
    try {
        // Grab the AI text and selection info (original context)
        const response = state.field(generatedResponseState);
        const context = state.field(currentSelectionState);

        const aiText: string = response?.airesponse ?? "";
        const selectionFrom = context?.from ?? 0;
        const selectionTo = context?.to ?? 0;

        // Dispatch the transaction to apply the AI changes
        view.dispatch({
            changes: { from: selectionFrom, to: selectionTo, insert: aiText },
        });
    } catch (error) {
        console.error("Error applying diff changes:", error);
    }
}

export const diffDecorationState = StateField.define<DecorationSet>({
    create(): DecorationSet {
        return Decoration.none;
    },
    update(decorations: DecorationSet, tr) {
        // Check if we got the AI response effect
        if (tr.effects.some(e => e.is(setGeneratedResponseEffect))) {
            return generateDiffView(tr.state);
        }

        // Check if the dismiss tooltip effect is present
        const hasDismissEffect = tr.effects.some(e => e.is(dismissTooltipEffect));
        if (hasDismissEffect) {
            return Decoration.none;
        }

        // Retain the existing decorations if no relevant changes
        return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
});

/**
 * Plugin to handle applying diff changes when the accept tooltip effect is triggered.
 */
const applyDiffPlugin = ViewPlugin.fromClass(class {
    update(update: ViewUpdate) {
        // Iterate through all transactions in the update
        for (const transaction of update.transactions) {
            for (const effect of transaction.effects) {
                if (effect.is(acceptTooltipEffect)) {
                    // Apply the diff changes by dispatching the transaction
                    setTimeout(() => {
                        dispatchAIChanges(update.state, update.view);
                    }, 0);
                }
            }
        }
    }
});

/**
 * Exported extension to be included in the EditorView.
 */
export const diffExtension = [
    diffDecorationState,
    applyDiffPlugin,
];
