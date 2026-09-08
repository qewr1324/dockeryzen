import * as vscode from "vscode";
import { ServiceConfig } from "../types/index.js";

export class ServiceManager {
	async selectServices(): Promise<ServiceConfig[]> {
		const services = [
			{
				label: "$(globe) Nginx",
				description: "Web server and reverse proxy",
				value: "nginx",
				defaultPort: 80,
				versions: ["1.25", "1.24", "1.23", "1.22"],
				picked: false,
			},
			{
				label: "$(graph) Grafana",
				description: "Monitoring and analytics platform",
				value: "grafana",
				defaultPort: 3000,
				versions: ["10.3", "10.2", "10.1", "10.0"],
				picked: false,
			},
			{
				label: "$(pulse) Prometheus",
				description: "Monitoring system and time series database",
				value: "prometheus",
				defaultPort: 9090,
				versions: ["2.48", "2.47", "2.46", "2.45"],
				picked: false,
			},
			{
				label: "$(key) Keycloak",
				description: "Identity and access management",
				value: "keycloak",
				defaultPort: 8080,
				versions: ["23.0", "22.0", "21.1", "21.0"],
				picked: false,
			},
			{
				label: "$(database) MinIO",
				description: "Object storage server",
				value: "minio",
				defaultPort: 9000,
				versions: ["latest", "RELEASE.2024-01-16T16-07-38Z"],
				picked: false,
			},
		];

		const selected = await vscode.window.showQuickPick(services, {
			placeHolder: "Select additional services (multi-select)",
			canPickMany: true,
			matchOnDescription: true,
		});

		const configs: ServiceConfig[] = [];

		if (selected) {
			for (const service of selected) {
				const config = await this.askServiceConfig(service);
				if (config) {
					configs.push(config);
				}
			}
		}

		return configs;
	}

	private async askServiceConfig(service: any): Promise<ServiceConfig | undefined> {
		const version = await vscode.window.showQuickPick(
			service.versions.map((v: string) => ({ label: `$(tag) ${v}`, value: v })),
			{ placeHolder: `Select ${service.label} version` },
		);

		if (!version) return undefined;

		const internalPort = await vscode.window.showInputBox({
			prompt: `Enter ${service.label} internal port`,
			value: service.defaultPort.toString(),
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
			prompt: `Enter ${service.label} external port`,
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
			type: service.value,
			version: version.value,
			internalPort: parseInt(internalPort),
			externalPort: parseInt(externalPort),
			useAlpine: useAlpine?.value === "yes",
		};
	}
}
