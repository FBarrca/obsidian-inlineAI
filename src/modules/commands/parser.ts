import { SlashCommand } from "./source";

export function parseCommand(
	userInput: string,
	prefix: string,
	customCommands: SlashCommand[],
): string {
	for (const command of customCommands) {
		const commandPattern = `${prefix}${command.keyword}`;
		if (userInput.includes(commandPattern)) {
			return userInput.replace(commandPattern, command.prompt);
		}
	}
	return userInput; // Return original text if no command matches
}
