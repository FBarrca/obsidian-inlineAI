import { App, Modal, Notice } from "obsidian";
import { copyToClipboard, openExternalUrl } from "./codex-auth";

export class CodexDeviceAuthModal extends Modal {
	private closedByApp = false;

	constructor(
		app: App,
		private userCode: string,
		private verificationUrl: string,
		private onCancel: () => void,
	) {
		super(app);
	}

	closeByApp(): void {
		this.closedByApp = true;
		this.close();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText("Sign in with ChatGPT");

		contentEl.createEl("p", {
			text: "Enter this one-time code on the ChatGPT sign-in page:",
		});

		contentEl.createEl("div", {
			cls: "inlineai-codex-device-code",
			text: this.userCode,
		});

		const buttonRow = contentEl.createDiv({ cls: "inlineai-codex-device-buttons" });

		buttonRow.createEl("button", { text: "Copy code" }).addEventListener(
			"click",
			async () => {
				const copied = await copyToClipboard(this.userCode);
				new Notice(
					copied ? "✅ Code copied to clipboard" : "❌ Could not copy code",
				);
			},
		);

		buttonRow
			.createEl("button", { text: "Open sign-in page", cls: "mod-cta" })
			.addEventListener("click", () => {
				openExternalUrl(this.verificationUrl);
			});

		contentEl.createEl("p", {
			cls: "setting-item-description",
			text: "Complete sign-in in your browser, then return here. This dialog closes automatically when sign-in succeeds.",
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		if (!this.closedByApp) {
			this.onCancel();
		}
	}
}
