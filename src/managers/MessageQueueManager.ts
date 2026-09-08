import * as vscode from "vscode";
import { MessageQueueConfig } from "../types/index.js";

export class MessageQueueManager {
	private queues: MessageQueueConfig[] = [];

	async selectMessageQueues(currentStep: number, totalSteps: number): Promise<MessageQueueConfig[] | "back" | "cancel"> {
		const allQueues = [
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
		quickPick.items = allQueues;
		quickPick.canSelectMany = true;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.buttons = [
			{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" },
			{ iconPath: new vscode.ThemeIcon("check"), tooltip: "OK" },
		];

		let isResolved = false;

		return new Promise((resolve) => {
			quickPick.onDidAccept(() => {
				if (isResolved) return;
				isResolved = true;
				const selected = quickPick.selectedItems as any[];
				quickPick.dispose();

				if (selected.length === 0) {
					resolve([]);
					return;
				}

				const result = this.showSelectedQueuesWithEdit(selected, currentStep, totalSteps);
				resolve(result);
			});

			quickPick.onDidTriggerButton((button) => {
				if (isResolved) return;

				if (button.tooltip === "Back") {
					isResolved = true;
					quickPick.dispose();
					resolve("back");
				} else if (button.tooltip === "OK") {
					isResolved = true;
					const selected = quickPick.selectedItems as any[];
					quickPick.dispose();

					if (selected.length === 0) {
						resolve([]);
						return;
					}

					const result = this.showSelectedQueuesWithEdit(selected, currentStep, totalSteps);
					resolve(result);
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

	private async showSelectedQueuesWithEdit(selectedQueues: any[], currentStep: number, totalSteps: number): Promise<MessageQueueConfig[] | "back" | "cancel"> {
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: Configure Message Queues`;
		quickPick.placeholder = "Click on a message queue to edit it, or press Enter to continue with defaults";
		quickPick.items = selectedQueues.map((mq) => ({
			label: `$(mail) ${mq.label.replace("$(mail) ", "")}`,
			description: mq.configured ? "$(check) Configured" : "$(gear) Click to Edit",
			detail: `Port: ${mq.defaultPort} | Version: ${mq.versions[0]}`,
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

		return new Promise((resolve) => {
			quickPick.onDidAccept(async () => {
				if (isResolved) return;

				const selected = quickPick.selectedItems[0] as any;
				if (selected) {
					isResolved = true;
					quickPick.dispose();

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
						this.queues.push(config);
						selected.configured = true;
					}

					const result = await this.showSelectedQueuesWithEdit(selectedQueues, currentStep, totalSteps);
					resolve(result);
				}
			});

			quickPick.onDidTriggerButton((button) => {
				if (isResolved) return;

				isResolved = true;
				quickPick.dispose();

				if (button.tooltip === "Back") {
					resolve("back");
				} else {
					// OK - Continue with defaults for unconfigured queues
					for (const mq of selectedQueues) {
						if (!mq.configured) {
							this.queues.push({
								type: mq.value,
								version: mq.versions[0],
								internalPort: mq.defaultPort,
								externalPort: mq.defaultPort,
								useAlpine: false,
							});
						}
					}
					resolve(this.queues);
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

	private async askQueueConfig(mq: any, currentStep: number, totalSteps: number): Promise<MessageQueueConfig | "back" | "cancel" | undefined> {
		const version = await this.showQuickPickWithBack(
			`Select ${mq.label.replace("$(mail) ", "")} Version`,
			mq.versions.map((v: string) => ({
				label: `$(tag) ${v}`,
				description: `Version ${v}`,
				detail: `Docker image tag: ${v}`,
				value: v,
			})),
			currentStep,
			totalSteps,
		);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (!version) return undefined;

		const internalPort = await this.showInputBoxWithBack(`Enter Internal Port`, mq.defaultPort.toString(), currentStep, totalSteps);
		if (internalPort === "back") return "back";
		if (internalPort === "cancel") return "cancel";
		if (!internalPort) return undefined;

		const externalPort = await this.showInputBoxWithBack(`Enter External Port`, internalPort, currentStep, totalSteps);
		if (externalPort === "back") return "back";
		if (externalPort === "cancel") return "cancel";
		if (!externalPort) return undefined;

		const useAlpine = await this.showQuickPickWithBack(
			`Use Alpine Version?`,
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
