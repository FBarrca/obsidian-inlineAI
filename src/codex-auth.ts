import * as http from "http";
import { Notice, requestUrl } from "obsidian";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE = "openid profile email offline_access";
const CALLBACK_PORT = 1455;

export interface CodexTokens {
	access: string;
	refresh: string;
	expires: number;
	accountId: string;
}

async function generatePKCE(): Promise<{
	verifier: string;
	challenge: string;
}> {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	const verifier = btoa(String.fromCharCode(...array))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");

	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const digest = await crypto.subtle.digest("SHA-256", data);
	const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");

	return { verifier, challenge };
}

function randomState(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeJWT(token: string): Record<string, any> | null {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;
		return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
	} catch {
		return null;
	}
}

function extractAccountId(accessToken: string): string | null {
	const payload = decodeJWT(accessToken);
	if (!payload) return null;
	const auth = payload["https://api.openai.com/auth"];
	return auth?.user_id ?? auth?.account_id ?? null;
}

async function exchangeCode(
	code: string,
	verifier: string,
): Promise<CodexTokens | null> {
	const res = await requestUrl({
		url: TOKEN_URL,
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: CLIENT_ID,
			code,
			code_verifier: verifier,
			redirect_uri: REDIRECT_URI,
		}).toString(),
		throw: false,
	});

	if (res.status < 200 || res.status >= 300) return null;

	const json = res.json as any;
	if (!json.access_token || !json.refresh_token) return null;

	const accountId = extractAccountId(json.access_token);
	if (!accountId) return null;

	return {
		access: json.access_token,
		refresh: json.refresh_token,
		expires: Date.now() + json.expires_in * 1000,
		accountId,
	};
}

export async function refreshCodexToken(
	tokens: CodexTokens,
): Promise<CodexTokens | null> {
	const res = await requestUrl({
		url: TOKEN_URL,
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: tokens.refresh,
			client_id: CLIENT_ID,
		}).toString(),
		throw: false,
	});

	if (res.status < 200 || res.status >= 300) return null;

	const json = res.json as any;
	if (!json.access_token || !json.refresh_token) return null;

	return {
		access: json.access_token,
		refresh: json.refresh_token,
		expires: Date.now() + json.expires_in * 1000,
		accountId: tokens.accountId,
	};
}

export async function getValidCodexToken(
	tokens: CodexTokens,
	onRefresh: (t: CodexTokens) => Promise<void>,
): Promise<string | null> {
	if (tokens.expires > Date.now() + 60_000) return tokens.access;

	const refreshed = await refreshCodexToken(tokens);
	if (!refreshed) {
		new Notice(
			"⚠️ Codex: session expired — open Settings → InlineAI to sign in again",
			10000,
		);
		return null;
	}

	await onRefresh(refreshed);
	return refreshed.access;
}

function isPortInUse(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const tester = http.createServer();
		tester.once("error", () => resolve(true));
		tester.once("listening", () => {
			tester.close();
			resolve(false);
		});
		tester.listen(port, "127.0.0.1");
	});
}

export async function startCodexOAuthFlow(): Promise<CodexTokens | null> {
	if (await isPortInUse(CALLBACK_PORT)) {
		new Notice(
			"❌ Codex: port 1455 is already in use — close the Codex CLI or any other app using it, then try again",
			8000,
		);
		return null;
	}

	const { verifier, challenge } = await generatePKCE();
	const state = randomState();

	const url = new URL(AUTHORIZE_URL);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", CLIENT_ID);
	url.searchParams.set("redirect_uri", REDIRECT_URI);
	url.searchParams.set("scope", SCOPE);
	url.searchParams.set("code_challenge", challenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("state", state);
	url.searchParams.set("id_token_add_organizations", "true");
	url.searchParams.set("codex_cli_simplified_flow", "true");
	url.searchParams.set("originator", "codex_cli_rs");

	return new Promise((resolve) => {
		let resolved = false;
		let server: http.Server | null = null;

		const done = (tokens: CodexTokens | null) => {
			if (resolved) return;
			resolved = true;
			server?.close();
			resolve(tokens);
		};

		server = http.createServer(async (req, res) => {
			if (!req.url?.startsWith("/auth/callback")) {
				res.writeHead(404);
				res.end();
				return;
			}

			const params = new URL(req.url, "http://localhost").searchParams;
			const code = params.get("code");
			const returnedState = params.get("state");

			if (!code || returnedState !== state) {
				res.writeHead(400);
				res.end("Invalid callback");
				done(null);
				return;
			}

			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(
				"<html><body><h2>Signed in! You can close this tab.</h2></body></html>",
			);

			const tokens = await exchangeCode(code, verifier);
			if (!tokens) {
				new Notice("❌ Codex: failed to exchange auth code for tokens");
			}
			done(tokens);
		});

		server.on("error", (e: any) => {
			if (e.code === "EADDRINUSE") {
				new Notice(
					"❌ Codex: port 1455 in use — close other Codex sessions first",
				);
			}
			done(null);
		});

		server.listen(CALLBACK_PORT, "127.0.0.1", () => {
			window.open(url.toString());
			new Notice(
				"🔐 Codex: browser opened — complete sign-in to continue",
			);
		});

		// Timeout after 5 minutes
		setTimeout(
			() => {
				if (!resolved) {
					new Notice("⚠️ Codex: sign-in timed out");
					done(null);
				}
			},
			5 * 60 * 1000,
		);
	});
}
