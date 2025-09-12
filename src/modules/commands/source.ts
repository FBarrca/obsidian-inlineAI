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
	return (context: CompletionContext) => {
		let word = context.matchBefore(new RegExp(`^\\${prefix}\\w*`));
		if (!word || (word.from == word.to && !context.explicit)) return null;
		return {
			from: word.from + 1,
			options: customCommands.map((cmd) => ({
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
				const keywords = customCommands
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
