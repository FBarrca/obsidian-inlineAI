import { requestUrl } from "obsidian";

const CODEX_API_URL = "https://chatgpt.com/backend-api/codex/responses";

interface ResponsesInput {
	type: "message";
	role: "developer" | "user" | "assistant";
	content: Array<{ type: "input_text"; text: string }>;
}

interface ResponsesBody {
	model: string;
	input: ResponsesInput[];
	instructions: string;
	store: false;
	stream: true;
	reasoning: { effort: string; summary: string };
	text: { verbosity: string };
	include: string[];
}

function normalizeModel(model: string): string {
	const m = model.toLowerCase().trim();
	if (m === "gpt-5.5" || m.includes("gpt-5.5")) return "gpt-5.5";
	if (m === "gpt-5.4-mini" || m.includes("gpt-5.4-mini"))
		return "gpt-5.4-mini";
	if (m.includes("gpt-5.3-codex-spark") || m.includes("codex-spark"))
		return "gpt-5.3-codex-spark";
	if (m.includes("gpt-5.2-codex") || m.includes("gpt 5.2 codex"))
		return "gpt-5.2-codex";
	if (m.includes("gpt-5.1-codex-max") || m.includes("codex-max"))
		return "gpt-5.1-codex-max";
	if (m.includes("codex-mini-latest") || m.includes("codex-mini"))
		return "codex-mini-latest";
	if (m.includes("gpt-5.1-codex") || m.includes("codex"))
		return "gpt-5.1-codex";
	if (m.includes("gpt-5.2")) return "gpt-5.2";
	if (m.includes("gpt-5.1")) return "gpt-5.1";
	return m; // pass through unknown models as-is
}

function parseSseText(sseBody: string): string {
	const lines = sseBody.split("\n");
	const parts: string[] = [];

	for (const line of lines) {
		if (!line.startsWith("data: ")) continue;
		const data = line.slice(6).trim();
		if (data === "[DONE]") break;

		try {
			const json = JSON.parse(data) as any;

			// response.output_text.delta — delta is a plain string
			if (
				json.type === "response.output_text.delta" &&
				typeof json.delta === "string"
			) {
				parts.push(json.delta);
			}

			// response.output_text.done — full text for this content part
			if (
				json.type === "response.output_text.done" &&
				typeof json.text === "string" &&
				parts.length === 0
			) {
				parts.push(json.text);
			}

			// response.completed — fallback if no deltas/done events
			if (json.type === "response.completed" && parts.length === 0) {
				for (const item of json.response?.output ?? []) {
					for (const c of item.content ?? []) {
						if (
							c.type === "output_text" &&
							typeof c.text === "string"
						) {
							parts.push(c.text);
						}
					}
				}
			}
		} catch {
			// ignore malformed lines
		}
	}

	return parts.join("");
}

const MAX_INPUT_CHARS = 60_000; // ~15k tokens, well under Codex limits

export async function callCodexApi(
	systemMessage: string,
	userMessage: string,
	accessToken: string,
	accountId: string,
	model: string,
): Promise<string> {
	if (!model.trim())
		throw new Error("No model selected — set one in Settings → InlineAI");

	const normalizedModel = normalizeModel(model);

	// Truncate very long inputs to avoid silent API failures
	const truncatedUser =
		userMessage.length > MAX_INPUT_CHARS
			? userMessage.slice(0, MAX_INPUT_CHARS) + "\n\n[…truncated]"
			: userMessage;

	const body: ResponsesBody = {
		model: normalizedModel,
		input: [
			{
				type: "message",
				role: "developer",
				content: [{ type: "input_text", text: systemMessage }],
			},
			{
				type: "message",
				role: "user",
				content: [{ type: "input_text", text: truncatedUser }],
			},
		],
		instructions: "",
		store: false,
		stream: true,
		reasoning: { effort: "medium", summary: "auto" },
		text: { verbosity: "medium" },
		include: ["reasoning.encrypted_content"],
	};

	const res = await requestUrl({
		url: CODEX_API_URL,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
			"chatgpt-account-id": accountId,
			"OpenAI-Beta": "responses=experimental",
			originator: "codex_cli_rs",
			accept: "text/event-stream",
		},
		body: JSON.stringify(body),
		throw: false,
	});

	if (res.status < 200 || res.status >= 300) {
		let msg = `Codex API error ${res.status}`;
		try {
			const err = JSON.parse(res.text)?.error;
			if (res.status === 429) {
				msg =
					"Subscription limit reached — wait a moment and try again";
			} else if (res.status === 403) {
				msg = `Model not available on your plan${err?.message ? ": " + err.message : " — try gpt-5.4-mini instead"}`;
			} else if (err?.message) {
				msg = err.message;
			}
		} catch {}
		throw new Error(msg);
	}

	const rawText = res.text;
	const result = parseSseText(rawText).trim();
	if (!result)
		throw new Error(
			"Codex returned an empty response — the model may only have produced reasoning tokens. Try a different prompt or model.",
		);
	return result;
}
