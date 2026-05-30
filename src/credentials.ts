import { App } from "obsidian";
import { CodexTokens } from "./codex-auth";

export const API_KEY_ID = "inlineai-api-key";
export const CODEX_AUTH_ID = "inlineai-codex-auth";

/** Minimal SecretStorage surface (Obsidian 1.11.4+). */
interface SecretStorageApi {
	getSecret(id: string): string | null;
	setSecret(id: string, secret: string): void;
}

/** Legacy fields that may exist in data.json from older plugin versions. */
export interface LegacySecretFields {
	apiKey?: string;
	codexAccess?: string;
	codexRefresh?: string;
	codexExpires?: number;
	codexAccountId?: string;
}

export function isSecretStorageAvailable(app: App): boolean {
	return "secretStorage" in app && (app as { secretStorage?: unknown }).secretStorage != null;
}

function getSecretStorage(app: App): SecretStorageApi | null {
	if (!isSecretStorageAvailable(app)) return null;
	return (app as unknown as { secretStorage: SecretStorageApi }).secretStorage;
}

export function getApiKey(app: App): string | null {
	const storage = getSecretStorage(app);
	if (!storage) return null;
	const value = storage.getSecret(API_KEY_ID);
	return value && value.length > 0 ? value : null;
}

export function setApiKey(app: App, key: string): void {
	const storage = getSecretStorage(app);
	if (!storage) return;
	storage.setSecret(API_KEY_ID, key.length === 0 ? "" : key);
}

export function clearApiKey(app: App): void {
	setApiKey(app, "");
}

function parseCodexTokens(raw: string): CodexTokens | null {
	try {
		const parsed = JSON.parse(raw) as CodexTokens;
		if (
			typeof parsed.access === "string" &&
			typeof parsed.refresh === "string" &&
			typeof parsed.expires === "number" &&
			typeof parsed.accountId === "string" &&
			parsed.access.length > 0 &&
			parsed.accountId.length > 0
		) {
			return parsed;
		}
	} catch {
		// invalid JSON
	}
	return null;
}

export function getCodexTokens(app: App): CodexTokens | null {
	const storage = getSecretStorage(app);
	if (!storage) return null;
	const raw = storage.getSecret(CODEX_AUTH_ID);
	if (!raw || raw.length === 0) return null;
	return parseCodexTokens(raw);
}

export function setCodexTokens(app: App, tokens: CodexTokens): void {
	const storage = getSecretStorage(app);
	if (!storage) return;
	storage.setSecret(CODEX_AUTH_ID, JSON.stringify(tokens));
}

export function clearCodexTokens(app: App): void {
	const storage = getSecretStorage(app);
	if (!storage) return;
	storage.setSecret(CODEX_AUTH_ID, "");
}

/**
 * Moves plaintext secrets from data.json into SecretStorage.
 * Returns true if any legacy fields were migrated (caller should re-save settings).
 */
export function migrateLegacySecrets(
	app: App,
	settings: LegacySecretFields,
): boolean {
	if (!isSecretStorageAvailable(app)) return false;

	let migrated = false;

	if (settings.apiKey && settings.apiKey.length > 0) {
		setApiKey(app, settings.apiKey);
		delete settings.apiKey;
		migrated = true;
	}

	if (
		settings.codexAccess &&
		settings.codexRefresh &&
		settings.codexAccountId
	) {
		setCodexTokens(app, {
			access: settings.codexAccess,
			refresh: settings.codexRefresh,
			expires: settings.codexExpires ?? 0,
			accountId: settings.codexAccountId,
		});
		delete settings.codexAccess;
		delete settings.codexRefresh;
		delete settings.codexExpires;
		delete settings.codexAccountId;
		migrated = true;
	}

	return migrated;
}
