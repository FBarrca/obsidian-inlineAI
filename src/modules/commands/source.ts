import { autocompletion, CompletionContext } from "@codemirror/autocomplete";
import { Extension, Range } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";

/**
 *
 * Interface describing a slash command.
 */
export interface SlashCommand {
	keyword: string;
	prompt: string;
}

export const BUILT_IN_COMMANDS: SlashCommand[] = [
	{
		keyword: "fix",
		prompt: "Fix grammar, spelling, and punctuation. Keep the original meaning and style. Output only the corrected text.",
	},
	{
		keyword: "shorter",
		prompt: "Make this text more concise. Remove filler words and redundancy. Keep all key information. Output only the shortened text.",
	},
	{
		keyword: "longer",
		prompt: "Expand this text with more detail, examples, or explanation. Keep the same tone. Output only the expanded text.",
	},
	{
		keyword: "formal",
		prompt: "Rewrite this text in a formal, professional tone. Output only the rewritten text.",
	},
	{
		keyword: "casual",
		prompt: "Rewrite this text in a friendly, casual tone. Output only the rewritten text.",
	},
	{
		keyword: "bullets",
		prompt: "Convert this text into a clear bullet-point list using Obsidian markdown. Output only the bullet list.",
	},
	{
		keyword: "summarize",
		prompt: "Write a concise summary of this text in 2-3 sentences. Output only the summary.",
	},
	{
		keyword: "continue",
		prompt: "Continue writing from where this text ends, matching the tone and style. Output only the continuation — do not repeat existing text.",
	},
];

// Factory function that creates a completion source with custom parameters
function createSlashCommandSource(
	options: {
		prefix: string;
		customCommands: SlashCommand[];
	} = {
		prefix: "/",
		customCommands: [],
	},
) {
	const { prefix, customCommands } = options;
	const allCommands = [...BUILT_IN_COMMANDS, ...customCommands];
	return (context: CompletionContext) => {
		let word = context.matchBefore(new RegExp(`^\\${prefix}\\w*`));
		if (!word || (word.from == word.to && !context.explicit)) return null;
		return {
			from: word.from + 1,
			options: allCommands.map((cmd) => ({
				label: cmd.keyword,
				type: undefined,
				detail: cmd.prompt,
			})),
		};
	};
}

// Create the extension that uses our custom completion source.
export function slashCommandAutocompletion(
	options: { prefix: string; customCommands: SlashCommand[] } = {
		prefix: "/",
		customCommands: [],
	},
) {
	return autocompletion({
		override: [createSlashCommandSource(options)],
		tooltipClass: () => "tooltip-autocomplete",
		optionClass: () => "completion-label",
		icons: false,
	});
}

// Create a decoration for highlighting slash commands
const slashCommandMark = Decoration.mark({ class: "cm-slash-command" });

export function createSlashCommandHighlighter({
	prefix,
	customCommands,
}: {
	prefix: string;
	customCommands: SlashCommand[];
}) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView) {
				const allCommands = [...BUILT_IN_COMMANDS, ...customCommands];
				const keywords = allCommands
					.map((cmd) => cmd.keyword)
					.join("|");
				const regexp = new RegExp(`\\${prefix}(${keywords})\\b`, "g");

				const decorations = view.visibleRanges.flatMap(
					({ from, to }) => {
						const text = view.state.doc.sliceString(from, to);
						return [...text.matchAll(regexp)]
							.map((match) =>
								match.index !== undefined
									? slashCommandMark.range(
											from + match.index,
											from +
												match.index +
												1 +
												match[1].length,
										)
									: null,
							)
							.filter(
								(dec): dec is Range<Decoration> => dec !== null,
							);
					},
				);

				return Decoration.set(decorations);
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);
}
