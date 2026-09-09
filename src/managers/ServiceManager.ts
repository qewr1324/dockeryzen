import * as vscode from "vscode";
import { ServiceConfig } from "../types/index.js";
import { validatePort } from "../utils/helpers.js";
import servicesConfig from "../config/services.json" with { type: "json" };

export class ServiceManager {
	private services: ServiceConfig[] = [];

	async selectServices(currentStep: number, totalSteps: number): Promise<ServiceConfig[] | "back" | "cancel"> {
		this.services = [];
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
					const result = this.showSelectedServicesWithEdit(selected, currentStep, totalSteps);
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
						const result = this.showSelectedServicesWithEdit(selected, currentStep, totalSteps);
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

						// باگ 527: حفظ تنظیمات قبلی هنگام back
						const existingConfig = this.services.find((s) => s.type === selected.value);
						const config = await this.askServiceConfig(selected, currentStep, totalSteps, existingConfig);
						if (config === "back") {
							resolve("back");
							return;
						}
						if (config === "cancel") {
							resolve("cancel");
							return;
						}
						if (config) {
							const exists = this.services.some((s) => s.type === config.type);
							if (!exists) {
								this.services.push(config);
							} else {
								const index = this.services.findIndex((s) => s.type === config.type);
								this.services[index] = config;
							}
							selected.configured = true;
						}
						const result = await this.showSelectedServicesWithEdit(selectedServices, currentStep, totalSteps);
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
						for (const service of selectedServices) {
							if (!service.configured) {
								const exists = this.services.some((s) => s.type === service.value);
								if (!exists) {
									// باگ 530: command برای بعضی services
									const command = this.getDefaultCommand(service.value);
									this.services.push({
										type: service.value,
										version: service.versions[0].value,
										internalPort: service.defaultPort,
										externalPort: service.defaultPort,
										useAlpine: false,
										image: service.versions[0].image,
										alpineImage: service.versions[0].alpineImage,
										command: command,
									});
								}
							}
						}
						resolve(this.services);
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

	// باگ 530: command پیش‌فرض برای services
	private getDefaultCommand(serviceType: string): string | undefined {
		const commands: Record<string, string | undefined> = {
			keycloak: "start",
			minio: 'server /data --console-address ":9001"',
			nginx: undefined,
			grafana: undefined,
			prometheus: undefined,
		};
		return commands[serviceType];
	}

	private async askServiceConfig(service: any, currentStep: number, totalSteps: number, existingConfig?: ServiceConfig): Promise<ServiceConfig | "back" | "cancel" | undefined> {
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

		// باگ 528: Keycloak پورت 8080 تداخل داره
		let defaultPort = service.defaultPort;
		if (service.value === "keycloak") {
			defaultPort = 8081; // تغییر پورت پیش‌فرض Keycloak
		}

		const internalPort = await this.showInputBoxWithBack(`Enter ${service.label} Internal Port`, (existingConfig?.internalPort || defaultPort).toString(), currentStep, totalSteps);
		if (internalPort === "back") return "back";
		if (internalPort === "cancel") return "cancel";
		if (!internalPort) return undefined;
		const internalPortValidation = validatePort(internalPort);
		if (internalPortValidation) {
			vscode.window.showErrorMessage(internalPortValidation);
			return undefined;
		}

		const externalPort = await this.showInputBoxWithBack(`Enter ${service.label} External Port`, internalPort, currentStep, totalSteps);
		if (externalPort === "back") return "back";
		if (externalPort === "cancel") return "cancel";
		if (!externalPort) return undefined;
		const externalPortValidation = validatePort(externalPort);
		if (externalPortValidation) {
			vscode.window.showErrorMessage(externalPortValidation);
			return undefined;
		}

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

		// باگ 529: MinIO version با کاراکتر خاص
		let versionValue = version.value;
		if (service.value === "minio" && versionValue.includes(":")) {
			versionValue = versionValue.replace(/:/g, "-");
		}

		return {
			type: service.value,
			version: versionValue,
			internalPort: parseInt(internalPort),
			externalPort: parseInt(externalPort),
			useAlpine: useAlpine?.value === "yes",
			image: version.image,
			alpineImage: version.alpineImage,
			command: this.getDefaultCommand(service.value),
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
