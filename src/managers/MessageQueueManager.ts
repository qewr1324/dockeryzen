import * as vscode from "vscode";
import { MessageQueueConfig } from "../types/index.js";

export class MessageQueueManager {
	async selectMessageQueues(): Promise<MessageQueueConfig[]> {
		const queues = [
			{
				label: "$(mail) Kafka",
				description: "Distributed event streaming platform",
				value: "kafka",
				defaultPort: 9092,
				versions: ["3.6.0", "3.5.0", "3.4.0", "3.3.0"],
				picked: false,
			},
			{
				label: "$(mail) RabbitMQ",
				description: "Message broker",
				value: "rabbitmq",
				defaultPort: 5672,
				versions: ["3.12", "3.11", "3.10", "3.9"],
				picked: false,
			},
			{
				label: "$(mail) ActiveMQ",
				description: "Apache message broker",
				value: "activemq",
				defaultPort: 61616,
				versions: ["5.18", "5.17", "5.16", "5.15"],
				picked: false,
			},
		];

		const selected = await vscode.window.showQuickPick(queues, {
			placeHolder: "Select message queues (multi-select)",
			canPickMany: true,
			matchOnDescription: true,
		});

		const configs: MessageQueueConfig[] = [];

		if (selected) {
			for (const queue of selected) {
				const config = await this.askQueueConfig(queue);
				if (config) {
					configs.push(config);
				}
			}
		}

		return configs;
	}

	private async askQueueConfig(queue: any): Promise<MessageQueueConfig | undefined> {
		const version = await vscode.window.showQuickPick(
			queue.versions.map((v: string) => ({ label: `$(tag) ${v}`, value: v })),
			{ placeHolder: `Select ${queue.label} version` },
		);

		if (!version) return undefined;

		const internalPort = await vscode.window.showInputBox({
			prompt: `Enter ${queue.label} internal port`,
			value: queue.defaultPort.toString(),
			validateInput: (value) => {
				const portNum = parseInt(value);
				if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
					return "Please enter a valid port number (1-65535)";
				}
				return null;
			},
		});

		if (!internalPort) return undefined;

		const externalPort = await vscode.window.showInputBox({
			prompt: `Enter ${queue.label} external port`,
			value: internalPort,
			validateInput: (value) => {
				const portNum = parseInt(value);
				if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
					return "Please enter a valid port number (1-65535)";
				}
				return null;
			},
		});

		if (!externalPort) return undefined;

		const useAlpine = await vscode.window.showQuickPick(
			[
				{ label: "$(check) Yes", description: "Use Alpine-based image", value: "yes" },
				{ label: "$(x) No", description: "Use standard image", value: "no" },
			],
			{ placeHolder: "Use Alpine version?", matchOnDescription: true },
		);

		return {
			type: queue.value,
			version: version.value,
			internalPort: parseInt(internalPort),
			externalPort: parseInt(externalPort),
			useAlpine: useAlpine?.value === "yes",
		};
	}
}
