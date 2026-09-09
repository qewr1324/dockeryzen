import * as vscode from "vscode";
import { MessageQueueConfig } from "../types/index.js";
import { validatePort } from "../utils/helpers.js";

import messageQueuesConfig from "../config/message-queues.json" with { type: "json" };

export class MessageQueueManager {
	private queues: MessageQueueConfig[] = [];

	async selectMessageQueues(currentStep: number, totalSteps: number): Promise<MessageQueueConfig[] | "back" | "cancel"> {
		this.queues = [];
		const allQueues = messageQueuesConfig.queues;

		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: Select Message Queues`;
		quickPick.placeholder = "Select message queues (multi-select) - Press Enter when done";
		quickPick.items = allQueues.map((mq: any) => ({
			label: `$(${mq.icon}) ${mq.label}`,
			description: mq.description,
			detail: mq.detail,
			value: mq.value,
			defaultPort: mq.defaultPort,
			versions: mq.versions,
			picked: false,
		}));
		quickPick.canSelectMany = true;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.buttons = [
			{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" },
			{ iconPath: new vscode.ThemeIcon("check"), tooltip: "OK" },
		];

		let isResolved = false;
		const disposables: vscode.Disposable[] = [];

		return new Promise((resolve) => {
			const cleanup = () => {
				disposables.forEach((d) => d.dispose());
				quickPick.dispose();
			};

			disposables.push(
				quickPick.onDidAccept(() => {
					if (isResolved) return;
					isResolved = true;
					const selected = quickPick.selectedItems as any[];
					cleanup();

					if (selected.length === 0) {
						resolve([]);
						return;
					}

					const result = this.showSelectedQueuesWithEdit(selected, currentStep, totalSteps);
					resolve(result);
				}),
				quickPick.onDidTriggerButton((button) => {
					if (isResolved) return;

					if (button.tooltip === "Back") {
						isResolved = true;
						cleanup();
						resolve("back");
					} else if (button.tooltip === "OK") {
						isResolved = true;
						const selected = quickPick.selectedItems as any[];
						cleanup();

						if (selected.length === 0) {
							resolve([]);
							return;
						}

						const result = this.showSelectedQueuesWithEdit(selected, currentStep, totalSteps);
						resolve(result);
					}
				}),
				quickPick.onDidHide(() => {
					if (!isResolved) {
						isResolved = true;
						cleanup();
						resolve("cancel");
					}
				}),
			);

			quickPick.show();
		});
	}

	private async showSelectedQueuesWithEdit(selectedQueues: any[], currentStep: number, totalSteps: number): Promise<MessageQueueConfig[] | "back" | "cancel"> {
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: Configure Message Queues`;
		quickPick.placeholder = "Click on a message queue to edit it, or press Enter to continue with defaults";
		quickPick.items = selectedQueues.map((mq) => ({
			label: `$(${mq.icon}) ${mq.label}`,
			description: mq.configured ? "$(check) Configured" : "$(gear) Click to Edit",
			detail: `Port: ${mq.defaultPort} | Version: ${mq.versions[0].label}`,
			value: mq.value,
			defaultPort: mq.defaultPort,
			versions: mq.versions,
			configured: mq.configured || false,
		}));
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.buttons = [
			{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" },
			{ iconPath: new vscode.ThemeIcon("check"), tooltip: "OK" },
		];

		let isResolved = false;
		const disposables: vscode.Disposable[] = [];

		return new Promise((resolve) => {
			const cleanup = () => {
				disposables.forEach((d) => d.dispose());
				quickPick.dispose();
			};

			disposables.push(
				quickPick.onDidAccept(async () => {
					if (isResolved) return;

					const selected = quickPick.selectedItems[0] as any;
					if (selected) {
						isResolved = true;
						cleanup();

						const config = await this.askQueueConfig(selected, currentStep, totalSteps);

						if (config === "back") {
							resolve("back");
							return;
						}
						if (config === "cancel") {
							resolve("cancel");
							return;
						}
						if (config) {
							const exists = this.queues.some((q) => q.type === config.type);
							if (!exists) {
								this.queues.push(config);
							} else {
								const index = this.queues.findIndex((q) => q.type === config.type);
								this.queues[index] = config;
							}
							selected.configured = true;
						}

						const result = await this.showSelectedQueuesWithEdit(selectedQueues, currentStep, totalSteps);
						resolve(result);
					}
				}),
				quickPick.onDidTriggerButton((button) => {
					if (isResolved) return;

					isResolved = true;
					cleanup();

					if (button.tooltip === "Back") {
						resolve("back");
					} else {
						for (const mq of selectedQueues) {
							if (!mq.configured) {
								const exists = this.queues.some((q) => q.type === mq.value);
								if (!exists) {
									this.queues.push({
										type: mq.value,
										version: mq.versions[0].value,
										internalPort: mq.defaultPort,
										externalPort: mq.defaultPort,
										useAlpine: false,
										image: mq.versions[0].image,
										alpineImage: mq.versions[0].alpineImage,
									});
								}
							}
						}
						resolve(this.queues);
					}
				}),
				quickPick.onDidHide(() => {
					if (!isResolved) {
						isResolved = true;
						cleanup();
						resolve("cancel");
					}
				}),
			);

			quickPick.show();
		});
	}

	private async askQueueConfig(mq: any, currentStep: number, totalSteps: number): Promise<MessageQueueConfig | "back" | "cancel" | undefined> {
		const versionItems = mq.versions.map((v: any) => ({
			label: `$(tag) ${v.label}`,
			description: `Version ${v.value}`,
			detail: v.image ? `Image: ${v.image}` : "External registry",
			value: v.value,
			image: v.image,
			alpineImage: v.alpineImage,
		}));

		const version = await this.showQuickPickWithBack(`Select ${mq.label} Version`, versionItems, currentStep, totalSteps);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (!version) return undefined;

		const internalPort = await this.showInputBoxWithBack(`Enter ${mq.label} Internal Port`, mq.defaultPort.toString(), currentStep, totalSteps);
		if (internalPort === "back") return "back";
		if (internalPort === "cancel") return "cancel";
		if (!internalPort) return undefined;

		const internalPortValidation = validatePort(internalPort);
		if (internalPortValidation) {
			vscode.window.showErrorMessage(internalPortValidation);
			return undefined;
		}

		const externalPort = await this.showInputBoxWithBack(`Enter ${mq.label} External Port`, internalPort, currentStep, totalSteps);
		if (externalPort === "back") return "back";
		if (externalPort === "cancel") return "cancel";
		if (!externalPort) return undefined;

		const externalPortValidation = validatePort(externalPort);
		if (externalPortValidation) {
			vscode.window.showErrorMessage(externalPortValidation);
			return undefined;
		}

		const useAlpine = await this.showQuickPickWithBack(
			`Use Alpine Version for ${mq.label}?`,
			[
				{ label: "$(check) Yes", description: "Alpine-based image", detail: "Smaller image size", value: "yes" },
				{ label: "$(x) No", description: "Standard image", detail: "Full-featured image", value: "no" },
			],
			currentStep,
			totalSteps,
		);
		if (useAlpine === "back") return "back";
		if (useAlpine === "cancel") return "cancel";

		return {
			type: mq.value,
			version: version.value,
			internalPort: parseInt(internalPort),
			externalPort: parseInt(externalPort),
			useAlpine: useAlpine?.value === "yes",
			image: version.image,
			alpineImage: version.alpineImage,
		};
	}

	private showQuickPickWithBack(title: string, items: any[], currentStep: number, totalSteps: number): Promise<any> {
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: ${title}`;
		quickPick.items = items;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.buttons = [{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" }];

		let isResolved = false;
		const disposables: vscode.Disposable[] = [];

		return new Promise((resolve) => {
			const cleanup = () => {
				disposables.forEach((d) => d.dispose());
				quickPick.dispose();
			};

			disposables.push(
				quickPick.onDidAccept(() => {
					if (!isResolved) {
						isResolved = true;
						const selected = quickPick.selectedItems[0];
						cleanup();
						resolve(selected);
					}
				}),
				quickPick.onDidTriggerButton((button) => {
					if (!isResolved) {
						isResolved = true;
						cleanup();
						resolve("back");
					}
				}),
				quickPick.onDidHide(() => {
					if (!isResolved) {
						isResolved = true;
						cleanup();
						resolve("cancel");
					}
				}),
			);

			quickPick.show();
		});
	}

	private showInputBoxWithBack(title: string, value: string, currentStep: number, totalSteps: number): Promise<string | "back" | "cancel"> {
		const inputBox = vscode.window.createInputBox();
		inputBox.title = `Step ${currentStep + 1}/${totalSteps}: ${title}`;
		inputBox.value = value;
		inputBox.buttons = [
			{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" },
			{ iconPath: new vscode.ThemeIcon("check"), tooltip: "OK" },
		];

		let isResolved = false;
		const disposables: vscode.Disposable[] = [];

		return new Promise((resolve) => {
			const cleanup = () => {
				disposables.forEach((d) => d.dispose());
				inputBox.dispose();
			};

			const acceptValue = () => {
				if (!isResolved) {
					isResolved = true;
					const value = inputBox.value;
					cleanup();
					resolve(value);
				}
			};

			disposables.push(
				inputBox.onDidAccept(acceptValue),
				inputBox.onDidTriggerButton((button) => {
					if (!isResolved) {
						if (button.tooltip === "Back") {
							isResolved = true;
							cleanup();
							resolve("back");
						} else if (button.tooltip === "OK") {
							acceptValue();
						}
					}
				}),
				inputBox.onDidHide(() => {
					if (!isResolved) {
						isResolved = true;
						cleanup();
						resolve("cancel");
					}
				}),
			);

			inputBox.show();
		});
	}
}
