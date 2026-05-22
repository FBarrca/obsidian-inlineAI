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
	if (m.includes("gpt-5.2-codex") || m.includes("gpt 5.2 codex")) return "gpt-5.2-codex";
	if (m.includes("gpt-5.1-codex-max") || m.includes("codex-max")) return "gpt-5.1-codex-max";
	if (m.includes("codex-mini-latest") || m.includes("codex-mini")) return "codex-mini-latest";
	if (m.includes("gpt-5.1-codex") || m.includes("codex")) return "gpt-5.1-codex";
	if (m.includes("gpt-5.2")) return "gpt-5.2";
	if (m.includes("gpt-5.1")) return "gpt-5.1";
	return "gpt-5.1-codex";
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
			// Responses API emits output[].content[].text deltas
			for (const output of json.output ?? []) {
				for (const content of output.content ?? []) {
					if (content.type === "output_text" && content.text) {
						parts.push(content.text);
					}
				}
			}
			// Delta format
			const delta = json.delta;
			if (delta?.type === "output_text" && delta.text) {
				parts.push(delta.text);
			}
			// Snapshot format (non-streaming final)
			if (json.type === "response.completed") {
				const output = json.response?.output ?? [];
				for (const item of output) {
					for (const c of item.content ?? []) {
						if (c.type === "output_text" && c.text) {
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

export async function callCodexApi(
	systemMessage: string,
	userMessage: string,
	accessToken: string,
	accountId: string,
	model: string,
): Promise<string> {
	const normalizedModel = normalizeModel(model);

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
				content: [{ type: "input_text", text: userMessage }],
			},
		],
		instructions: "",
		store: false,
		stream: true,
		reasoning: { effort: "medium", summary: "auto" },
		text: { verbosity: "medium" },
		include: ["reasoning.encrypted_content"],
	};

	const res = await fetch(CODEX_API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${accessToken}`,
			"chatgpt-account-id": accountId,
			"OpenAI-Beta": "responses=experimental",
			"originator": "codex_cli_rs",
			"accept": "text/event-stream",
		},
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Codex API ${res.status}: ${text.slice(0, 200)}`);
	}

	const rawText = await res.text();
	const result = parseSseText(rawText);
	if (!result) throw new Error("Codex returned empty response");
	return result;
}
