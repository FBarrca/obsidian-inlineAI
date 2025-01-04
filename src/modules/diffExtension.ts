// modules/diffExtension.ts
import {
    EditorState,
    StateEffect,
    StateField,
    RangeSetBuilder,
} from "@codemirror/state";
import {
    Decoration,
    DecorationSet,
    EditorView,
    WidgetType,
} from "@codemirror/view";
import { diffWords, Change } from "diff";

import { dismmisTooltipEffect } from "./WidgetExtension";
import { AIResponseField, setAIResponseEffect } from "./AIExtension";
import { selectionInfoField } from "./SelectionSate";

// Configuration for chaff removal
const MIN_UNCHANGED_LENGTH = 5; // Minimum length of unchanged text to keep

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

        // Optional: Add tooltip or additional styling here
        return wrapper;
    }

    ignoreEvent(): boolean {
        // Decide whether to ignore events on the widget
        return false;
    }
}

/**
 * Generates a DecorationSet representing the diff between AI response and context.
 * @param state - The current editor state.
 * @returns A DecorationSet with the appropriate widgets.
 */
function generateDiffView(state: EditorState): DecorationSet {
    try {
        // Retrieve the AI response and the current context text from the state
        const response = state.field(AIResponseField);
        const context = state.field(selectionInfoField);

        const aiText: string = response?.airesponse ?? "";
        const contextText: string = context?.text ?? "";

        // Debugging: Remove or conditionally enable in production
        console.debug("Generating diff view", {
            aiResponse: response,
            contextText: context,
        });

        console.log(
            "AI Response:",
            response,
            "Context Text:",
            context
        )
        // Compute the word-level differences using the 'diff' package
        const diffResult: Change[] = diffWords(contextText, aiText);

        // Initialize RangeSetBuilder for efficient decoration construction
        const builder = new RangeSetBuilder<Decoration>();
        let currentPos = 0;

        diffResult.forEach((part) => {
            const { added, removed, value } = part;
            const length = value.length;

            if (added) {
                // Highlight added text (AI response)
                const widget = new ChangeContentWidget(value, 'added');
                builder.add(
                    currentPos,
                    currentPos,
                    Decoration.widget({ widget, side: 1 })
                );
            } else if (removed) {
                // Highlight removed text (from context)
                const widget = new ChangeContentWidget(value, 'removed');
                builder.add(
                    currentPos,
                    currentPos + length,
                    Decoration.widget({ widget, side: -1 })
                );
                currentPos += length;
            } else {
                // Unchanged text
                if (length >= MIN_UNCHANGED_LENGTH) {
                    // Retain unchanged text if it meets the minimum length
                    currentPos += length;
                } else {
                    // Skip small unchanged text to remove chaff
                    // Optionally, add a thin separator or annotation if desired
                    currentPos += length;
                }
            }
        });

        // Debugging: Remove or conditionally enable in production
        console.debug("Diff result:", diffResult);

        return builder.finish();
    } catch (error) {
        console.error("Error generating diff view:", error);
        return Decoration.none;
    }
}

/**
 * Defines a StateField to manage the diff decorations.
 */
export const diffField = StateField.define<DecorationSet>({
    create(): DecorationSet {
        return Decoration.none;
    },
    update(decorations: DecorationSet, tr): DecorationSet {

        // Check if the AI response effect is present
        const hasAIResponseEffect = tr.effects.some(e => e.is(setAIResponseEffect));
        if (hasAIResponseEffect) {
            const effect = tr.effects.find(e => e.is(setAIResponseEffect));
            if (effect && effect !== null) {
                console.debug("Received AI response");
                console.log("AI Response:", effect);
                return generateDiffView(tr.state);
            } else {
                console.error("Error in AI response effect");
                return Decoration.none;
            }
        }

        // Check if the dismiss tooltip effect is present
        const hasDismissEffect = tr.effects.some(e => e.is(dismmisTooltipEffect));
        if (hasDismissEffect) {
            return Decoration.none;
        }

        // Retain the existing decorations if no relevant changes
        return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
});

/**
 * Exported extension to be included in the EditorView.
 */
export const diffExtension = [
    diffField,
];
