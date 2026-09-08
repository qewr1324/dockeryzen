import * as vscode from "vscode";
import { ServiceConfig } from "../types/index.js";
const servicesConfig: any = require("../config/services.json");

export class ServiceManager {
	private services: ServiceConfig[] = [];

	async selectServices(currentStep: number, totalSteps: number): Promise<ServiceConfig[] | "back" | "cancel"> {
		const allServices: any[] = servicesConfig.services;

		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: Select Additional Services`;
		quickPick.placeholder = "Select additional services (multi-select) - Press Enter when done";
		quickPick.items = allServices.map((service: any) => ({
			label: `$(${service.icon}) ${service.label}`,
			description: service.description,
			detail: service.detail,
			value: service.value,
			defaultPort: service.defaultPort,
			versions: service.versions,
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
			label: `$(${service.icon}) ${service.label}`,
			description: service.configured ? "$(check) Configured" : "$(gear) Click to Edit",
			detail: `Port: ${service.defaultPort} | Version: ${service.versions[0].label}`,
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
								version: service.versions[0].value,
								internalPort: service.defaultPort,
								externalPort: service.defaultPort,
								useAlpine: false,
								image: service.versions[0].image,
								alpineImage: service.versions[0].alpineImage,
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
		const versionItems = service.versions.map((v: any) => ({
			label: `$(tag) ${v.label}`,
			description: `Version ${v.value}`,
			detail: v.image ? `Image: ${v.image}` : "External registry",
			value: v.value,
			image: v.image,
			alpineImage: v.alpineImage,
		}));

		const version = await this.showQuickPickWithBack(`Select ${service.label} Version`, versionItems, currentStep, totalSteps);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (!version) return undefined;

		const internalPort = await this.showInputBoxWithBack(`Enter ${service.label} Internal Port`, service.defaultPort.toString(), currentStep, totalSteps);
		if (internalPort === "back") return "back";
		if (internalPort === "cancel") return "cancel";
		if (!internalPort) return undefined;

		const externalPort = await this.showInputBoxWithBack(`Enter ${service.label} External Port`, internalPort, currentStep, totalSteps);
		if (externalPort === "back") return "back";
		if (externalPort === "cancel") return "cancel";
		if (!externalPort) return undefined;

		const useAlpine = await this.showQuickPickWithBack(
			`Use Alpine Version for ${service.label}?`,
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
