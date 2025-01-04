// modules/SelectionState.ts
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { dismissTooltipEffect } from "./WidgetExtension";

/**
 * Interface describing the selection range and text.
 */
export interface SelectionInfo {
    from: number;
    to: number;
    text: string;
}

/**
 * Effect used to set or clear the selection info.
 */
export const setSelectionInfoEffect = StateEffect.define<SelectionInfo | null>();

/**
 * Field that holds the most recently preserved selection info.
 */
export const selectionInfoField = StateField.define<SelectionInfo | null>({
    create() {
        return null;
    },
    update(value, tr) {
        // Look for a setSelectionInfoEffect in this transaction
        const effect = tr.effects.find(e => e.is(setSelectionInfoEffect));
        if (effect) {
            return effect.value;
        } else if (tr.effects.some(e => e.is(dismissTooltipEffect))) {
            return null;
        }

        return value;
    },
});

/**
 * Decoration to highlight the selected text.
 */
const highlightDecoration = Decoration.mark({
    class: "cm-selectionBackground", // CSS class for highlighting
});

/**
 * StateField that manages the decoration set for highlighting.
 */
export const selectionHighlightField = StateField.define<DecorationSet>({
    create(state) {
        const info = state.field(selectionInfoField);
        if (info) {
            return Decoration.set([highlightDecoration.range(info.from, info.to)]);
        }
        return Decoration.none;
    },
    update(decos, tr) {
        // Check if selectionInfoField has changed
        const info = tr.state.field(selectionInfoField);
        if (info) {
            return Decoration.set([highlightDecoration.range(info.from, info.to)]);
        }
        return Decoration.none;
    },
    provide: f => EditorView.decorations.from(f),
});
