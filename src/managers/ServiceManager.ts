import * as vscode from "vscode";
import { ServiceConfig } from "../types/index.js";

export class ServiceManager {
	private services: ServiceConfig[] = [];

	async selectServices(currentStep: number, totalSteps: number): Promise<ServiceConfig[] | "back" | "cancel"> {
		const allServices = [
			{
				label: "$(globe) Nginx",
				description: "Web Server & Reverse Proxy",
				detail: "Port: 80 | Version: 1.25 | Best for: Load balancing, Static files",
				value: "nginx",
				defaultPort: 80,
				versions: ["1.25", "1.24", "1.23", "1.22"],
				picked: false,
			},
			{
				label: "$(graph) Grafana",
				description: "Monitoring & Analytics",
				detail: "Port: 3000 | Version: 10.2 | Best for: Dashboards, Metrics visualization",
				value: "grafana",
				defaultPort: 3000,
				versions: ["10.3", "10.2", "10.1", "10.0"],
				picked: false,
			},
			{
				label: "$(pulse) Prometheus",
				description: "Monitoring System",
				detail: "Port: 9090 | Version: 2.48 | Best for: Metrics collection, Alerting",
				value: "prometheus",
				defaultPort: 9090,
				versions: ["2.48", "2.47", "2.46", "2.45"],
				picked: false,
			},
			{
				label: "$(key) Keycloak",
				description: "Identity & Access Management",
				detail: "Port: 8080 | Version: 23.0 | Best for: SSO, OAuth2, OIDC",
				value: "keycloak",
				defaultPort: 8080,
				versions: ["23.0", "22.0", "21.1", "21.0"],
				picked: false,
			},
			{
				label: "$(database) MinIO",
				description: "Object Storage",
				detail: "Port: 9000 | Version: latest | Best for: S3-compatible storage",
				value: "minio",
				defaultPort: 9000,
				versions: ["latest", "RELEASE.2024-01-16T16-07-38Z"],
				picked: false,
			},
		];

		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: Select Additional Services`;
		quickPick.placeholder = "Select additional services (multi-select) - Press Enter when done";
		quickPick.items = allServices;
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

				const result = this.showSelectedServicesWithEdit(selected, currentStep, totalSteps);
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

					const result = this.showSelectedServicesWithEdit(selected, currentStep, totalSteps);
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

	private async showSelectedServicesWithEdit(selectedServices: any[], currentStep: number, totalSteps: number): Promise<ServiceConfig[] | "back" | "cancel"> {
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: Configure Services`;
		quickPick.placeholder = "Click on a service to edit it, or press Enter to continue with defaults";
		quickPick.items = selectedServices.map((service) => ({
			label: service.label,
			description: service.configured ? "$(check) Configured" : "$(gear) Click to Edit",
			detail: `Port: ${service.defaultPort} | Version: ${service.versions[0]}`,
			value: service.value,
			defaultPort: service.defaultPort,
			versions: service.versions,
			configured: service.configured || false,
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

					const config = await this.askServiceConfig(selected, currentStep, totalSteps);

					if (config === "back") {
						resolve("back");
						return;
					}
					if (config === "cancel") {
						resolve("cancel");
						return;
					}
					if (config) {
						this.services.push(config);
						selected.configured = true;
					}

					const result = await this.showSelectedServicesWithEdit(selectedServices, currentStep, totalSteps);
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
					// OK - Continue with defaults for unconfigured services
					for (const service of selectedServices) {
						if (!service.configured) {
							this.services.push({
								type: service.value,
								version: service.versions[0],
								internalPort: service.defaultPort,
								externalPort: service.defaultPort,
								useAlpine: false,
							});
						}
					}
					resolve(this.services);
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

	private async askServiceConfig(service: any, currentStep: number, totalSteps: number): Promise<ServiceConfig | "back" | "cancel" | undefined> {
		const version = await this.showQuickPickWithBack(
			`Select Version`,
			service.versions.map((v: string) => ({
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

		const internalPort = await this.showInputBoxWithBack(`Enter Internal Port`, service.defaultPort.toString(), currentStep, totalSteps);
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
			type: service.value,
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
