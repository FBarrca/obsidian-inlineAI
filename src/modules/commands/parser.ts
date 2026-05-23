import { SlashCommand, BUILT_IN_COMMANDS } from "./source";

export function parseCommand(
	userInput: string,
	prefix: string,
	customCommands: SlashCommand[],
): string {
	const allCommands = [...BUILT_IN_COMMANDS, ...customCommands];
	for (const command of allCommands) {
		const commandPattern = `${prefix}${command.keyword}`;
		if (userInput.includes(commandPattern)) {
			return userInput.replace(commandPattern, command.prompt);
		}
	}
	return userInput;
}
