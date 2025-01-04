import {
    StateEffect,
    StateField,
} from "@codemirror/state";

import { dismissTooltipEffect } from "./WidgetExtension";

// Custom structure that has a airesponse and context fields
export interface AIResponse {
    airesponse: string;
    prompt: string;
}

/**
 * State Effect to set the AI response.
 */
export const setGeneratedResponseEffect = StateEffect.define<AIResponse | null>();

// State field of type text to store the response from the API
export const generatedResponseState = StateField.define<AIResponse | null>({
    create() {
        return null;
    },
    update(value, tr) {
        // Check if the transaction contains an effect to set the response
        if (tr.effects.some((e) => e.is(setGeneratedResponseEffect))) {
            const effect = tr.effects.find((e) => e.is(setGeneratedResponseEffect));
            return effect ? effect.value : value;
        }
        // if we geta dismmisTooltipEffect we should clear the response
        if (tr.effects.some((e) => e.is(dismissTooltipEffect))) {
            return null;
        }
        return value;
    },
});


