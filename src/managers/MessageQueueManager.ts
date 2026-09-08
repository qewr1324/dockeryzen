import * as vscode from "vscode";
import { MessageQueueConfig } from "../types/index.js";

export class MessageQueueManager {
	async selectMessageQueues(currentStep: number, totalSteps: number): Promise<MessageQueueConfig[] | "back" | "cancel"> {
		const queues = [
			{
				label: "$(mail) Kafka",
				description: "Distributed Event Streaming",
				detail: "Port: 9092 | Version: 3.6.0 | Best for: High-throughput, Event sourcing",
				value: "kafka",
				defaultPort: 9092,
				versions: ["3.6.0", "3.5.0", "3.4.0", "3.3.0"],
				picked: false,
			},
			{
				label: "$(mail) RabbitMQ",
				description: "Message Broker",
				detail: "Port: 5672 | Version: 3.12 | Best for: Reliable messaging, Complex routing",
				value: "rabbitmq",
				defaultPort: 5672,
				versions: ["3.12", "3.11", "3.10", "3.9"],
				picked: false,
			},
			{
				label: "$(mail) ActiveMQ",
				description: "Apache Message Broker",
				detail: "Port: 61616 | Version: 5.18 | Best for: JMS, Enterprise integration",
				value: "activemq",
				defaultPort: 61616,
				versions: ["5.18", "5.17", "5.16", "5.15"],
				picked: false,
			},
		];

		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: Select Message Queues`;
		quickPick.placeholder = "Select message queues (multi-select) - Press Enter when done";
		quickPick.items = queues;
		quickPick.canSelectMany = true;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.buttons = [
			{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" },
			{ iconPath: new vscode.ThemeIcon("check"), tooltip: "OK" },
		];

		let isResolved = false;

		return new Promise((resolve) => {
			const handleDone = () => {
				if (isResolved) return;
				isResolved = true;
				const selected = quickPick.selectedItems as any[];
				quickPick.dispose();

				const configs: MessageQueueConfig[] = [];

				const processQueue = async (index: number): Promise<void> => {
					if (index >= selected.length) {
						resolve(configs);
						return;
					}

					const queue = selected[index];
					const config = await this.askQueueConfig(queue, currentStep, totalSteps);

					if (config === "back") {
						resolve("back");
						return;
					}
					if (config === "cancel") {
						resolve("cancel");
						return;
					}
					if (config) {
						configs.push(config);
					}

					await processQueue(index + 1);
				};

				processQueue(0);
			};

			quickPick.onDidAccept(handleDone);

			quickPick.onDidTriggerButton((button) => {
				if (isResolved) return;

				if (button.tooltip === "Back") {
					isResolved = true;
					quickPick.dispose();
					resolve("back");
				} else if (button.tooltip === "OK") {
					handleDone();
				}
			});

			quickPick.onDidHide(() => {
				if (!isResolved) {
					isResolved = true;
					quickPick.dispose();
					resolve("cancel");
				}
			});

			quickPick.show();
		});
	}

	private async askQueueConfig(queue: any, currentStep: number, totalSteps: number): Promise<MessageQueueConfig | "back" | "cancel" | undefined> {
		const version = await this.showQuickPickWithBack(
			`Select ${queue.label} Version`,
			queue.versions.map((v: string) => ({
				label: `$(tag) ${v}`,
				description: `${queue.label} version ${v}`,
				detail: `Docker image tag: ${v}`,
				value: v,
			})),
			currentStep,
			totalSteps,
		);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (!version) return undefined;

		const internalPort = await this.showInputBoxWithBack(`Enter ${queue.label} Internal Port`, queue.defaultPort.toString(), currentStep, totalSteps);
		if (internalPort === "back") return "back";
		if (internalPort === "cancel") return "cancel";
		if (!internalPort) return undefined;

		const externalPort = await this.showInputBoxWithBack(`Enter ${queue.label} External Port`, internalPort, currentStep, totalSteps);
		if (externalPort === "back") return "back";
		if (externalPort === "cancel") return "cancel";
		if (!externalPort) return undefined;

		const useAlpine = await this.showQuickPickWithBack(
			`Use Alpine Version for ${queue.label}?`,
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
			type: queue.value,
			version: version.value,
			internalPort: parseInt(internalPort),
			externalPort: parseInt(externalPort),
			useAlpine: useAlpine?.value === "yes",
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

		return new Promise((resolve) => {
			quickPick.onDidAccept(() => {
				if (!isResolved) {
					isResolved = true;
					const selected = quickPick.selectedItems[0];
					quickPick.dispose();
					resolve(selected);
				}
			});

			quickPick.onDidTriggerButton((button) => {
				if (!isResolved) {
					isResolved = true;
					quickPick.dispose();
					resolve("back");
				}
			});

			quickPick.onDidHide(() => {
				if (!isResolved) {
					isResolved = true;
					quickPick.dispose();
					resolve("cancel");
				}
			});

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

		return new Promise((resolve) => {
			const acceptValue = () => {
				if (!isResolved) {
					isResolved = true;
					const value = inputBox.value;
					inputBox.dispose();
					resolve(value);
				}
			};

			inputBox.onDidAccept(acceptValue);

			inputBox.onDidTriggerButton((button) => {
				if (!isResolved) {
					if (button.tooltip === "Back") {
						isResolved = true;
						inputBox.dispose();
						resolve("back");
					} else if (button.tooltip === "OK") {
						acceptValue();
					}
				}
			});

			inputBox.onDidHide(() => {
				if (!isResolved) {
					isResolved = true;
					inputBox.dispose();
					resolve("cancel");
				}
			});

			inputBox.show();
		});
	}
}
