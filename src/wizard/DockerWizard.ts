import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import { ProjectConfig } from "../types/index.js";
import { DatabaseManager } from "../managers/DatabaseManager.js";
import { MessageQueueManager } from "../managers/MessageQueueManager.js";
import { ServiceManager } from "../managers/ServiceManager.js";
import { DockerfileGenerator } from "../generators/DockerfileGenerator.js";
import { DockerComposeGenerator } from "../generators/DockerComposeGenerator.js";
import { DockerignoreGenerator } from "../generators/DockerignoreGenerator.js";
import { validatePort, validateProjectName, fileExists, safeWriteFile } from "../utils/helpers.js";

import javaConfig from "../config/languages/java.json" with { type: "json" };
import dotnetConfig from "../config/languages/dotnet.json" with { type: "json" };
import pythonConfig from "../config/languages/python.json" with { type: "json" };
import nodejsConfig from "../config/languages/nodejs.json" with { type: "json" };
import rubyConfig from "../config/languages/ruby.json" with { type: "json" };
import phpConfig from "../config/languages/php.json" with { type: "json" };
import rustConfig from "../config/languages/rust.json" with { type: "json" };
import goConfig from "../config/languages/go.json" with { type: "json" };
import cppConfig from "../config/languages/cpp.json" with { type: "json" };
import cConfig from "../config/languages/c.json" with { type: "json" };

export class DockerWizard {
	private config: ProjectConfig;
	private currentStep: number = 0;
	private totalSteps: number = 8;
	private languageConfigs: Map<string, any> = new Map();
	private wizardState: Map<string, any> = new Map();
	private context: vscode.ExtensionContext;

	constructor(context?: vscode.ExtensionContext) {
		this.context = context || ({} as vscode.ExtensionContext);
		this.config = {
			projectName: "",
			language: "",
			port: this.getConfigValue<number>("defaultPort", 8080),
			useAlpine: this.getConfigValue<boolean>("useAlpineByDefault", false),
			enableDebug: this.getConfigValue<boolean>("enableDebugByDefault", false),
			enableHealthCheck: this.getConfigValue<boolean>("enableHealthCheckByDefault", false),
			debugPort: this.getConfigValue<number>("debugPort", 5005),
			databases: [],
			messageQueues: [],
			services: [],
		};
	}

	private getConfigValue<T>(key: string, defaultValue: T): T {
		try {
			const config = vscode.workspace.getConfiguration("dockeryzen");
			return config.get<T>(key, defaultValue);
		} catch {
			return defaultValue;
		}
	}

	async start(): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			const action = await vscode.window.showWarningMessage("No workspace folder found. Please open a folder first.", "Open Folder");
			if (action === "Open Folder") {
				await vscode.commands.executeCommand("vscode.openFolder");
			}
			return;
		}

		vscode.window.showInformationMessage("🚀 Welcome to Dockeryzen! Let's create your Docker configuration.");

		const steps = [
			{ name: "Project Name", fn: () => this.askProjectName() },
			{ name: "Language", fn: () => this.askLanguage() },
			{ name: "Port", fn: () => this.askPort() },
			{ name: "General Options", fn: () => this.askGeneralOptions() },
			{ name: "Language Settings", fn: () => this.askLanguageSpecificSettings() },
			{ name: "Databases", fn: () => this.askDatabases() },
			{ name: "Message Queues", fn: () => this.askMessageQueues() },
			{ name: "Services", fn: () => this.askServices() },
		];

		this.currentStep = 0;

		while (this.currentStep < steps.length) {
			const step = steps[this.currentStep];

			try {
				const result = await step.fn();

				if (result === "back") {
					this.currentStep = Math.max(0, this.currentStep - 1);
					continue;
				}

				if (result === "cancel") {
					vscode.window.showInformationMessage("❌ Operation cancelled by user");
					return;
				}

				this.currentStep++;
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				vscode.window.showErrorMessage(`Error in step "${step.name}": ${message}`);
				return;
			}
		}

		await this.generateFiles();
	}

	private async askProjectName(): Promise<"next" | "back" | "cancel"> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const defaultName = workspaceFolder ? path.basename(workspaceFolder.uri.fsPath) : "my-project";

		const inputBox = vscode.window.createInputBox();
		inputBox.title = `Step ${this.currentStep + 1}/${this.totalSteps}: Project Name`;
		inputBox.prompt = "Enter project name (e.g., my-awesome-app)";
		inputBox.placeholder = "my-awesome-app";
		inputBox.value = defaultName;
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
					const value = inputBox.value;
					const validation = validateProjectName(value);
					if (validation) {
						inputBox.validationMessage = validation;
						return;
					}
					isResolved = true;
					this.config.projectName = value;
					cleanup();
					resolve("next");
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

	private async askLanguage(): Promise<"next" | "back" | "cancel"> {
		const languageConfigs: any[] = [javaConfig, dotnetConfig, pythonConfig, nodejsConfig, rubyConfig, phpConfig, rustConfig, goConfig, cppConfig, cConfig];

		const languages: any[] = [];
		const seenLabels = new Set<string>();

		for (const config of languageConfigs) {
			if (config.types) {
				for (const type of config.types) {
					const label = `$(${type.icon}) ${type.label}`;
					if (!seenLabels.has(label)) {
						seenLabels.add(label);
						languages.push({
							label,
							description: type.description,
							detail: type.detail,
							value: type.type,
							config: config,
						});
					}
				}
			} else {
				const label = `$(${config.icon}) ${config.label}`;
				if (!seenLabels.has(label)) {
					seenLabels.add(label);
					languages.push({
						label,
						description: config.description,
						detail: config.detail,
						value: config.type,
						config: config,
					});
				}
			}
		}

		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${this.currentStep + 1}/${this.totalSteps}: Select Language`;
		quickPick.placeholder = "Select your project language/framework (type to search)";
		quickPick.items = languages;
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
						const selected = quickPick.selectedItems[0] as any;
						if (selected) {
							isResolved = true;
							this.config.language = selected.value;
							this.languageConfigs.set(selected.value, selected.config);
							cleanup();
							resolve("next");
						}
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

	private async askPort(): Promise<"next" | "back" | "cancel"> {
		const defaultPort = this.getConfigValue<number>("defaultPort", 8080);

		const inputBox = vscode.window.createInputBox();
		inputBox.title = `Step ${this.currentStep + 1}/${this.totalSteps}: Application Port`;
		inputBox.prompt = "Enter application port (1-65535)";
		inputBox.placeholder = "8080";
		inputBox.value = defaultPort.toString();
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
					const value = inputBox.value;
					const validation = validatePort(value);
					if (validation) {
						inputBox.validationMessage = validation;
						return;
					}
					isResolved = true;
					this.config.port = parseInt(value);
					cleanup();
					resolve("next");
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

	private async askGeneralOptions(): Promise<"next" | "back" | "cancel"> {
		const options = [
			{
				label: "$(package) Use Alpine",
				description: "Smaller image size (where available)",
				detail: "Uses Alpine-based images for reduced container size",
				picked: this.config.useAlpine,
				tooltip: "Warning: Alpine may not be compatible with all native modules",
			},
			{
				label: "$(bug) Enable Debug",
				description: `Debug on port ${this.config.debugPort || 5005}`,
				detail: "Enables remote debugging",
				picked: this.config.enableDebug,
			},
			{
				label: "$(pulse) Enable Health Check",
				description: "Health check endpoint",
				detail: "Adds HEALTHCHECK to monitor application status",
				picked: this.config.enableHealthCheck,
			},
		];

		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${this.currentStep + 1}/${this.totalSteps}: General Options`;
		quickPick.placeholder = "Select general options (multi-select) - Press Enter when done";
		quickPick.items = options;
		quickPick.canSelectMany = true;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.buttons = [
			{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" },
			{ iconPath: new vscode.ThemeIcon("check"), tooltip: "OK" },
		];

		let isResolved = false;
		const disposables: vscode.Disposable[] = [];

		const applySelections = () => {
			const selected = quickPick.selectedItems;
			this.config.useAlpine = selected.some((o) => o.label.includes("Alpine"));
			this.config.enableDebug = selected.some((o) => o.label.includes("Debug"));
			this.config.enableHealthCheck = selected.some((o) => o.label.includes("Health"));

			const selectedLabels = selected.map((o) => o.label.split(" ")[1]).join(", ");
			if (selectedLabels) {
				quickPick.placeholder = `Selected: ${selectedLabels} - Press Enter to continue`;
			}
		};

		return new Promise((resolve) => {
			const cleanup = () => {
				disposables.forEach((d) => d.dispose());
				quickPick.dispose();
			};

			disposables.push(
				quickPick.onDidChangeSelection(() => {
					applySelections();
				}),
				quickPick.onDidAccept(() => {
					if (!isResolved) {
						isResolved = true;
						applySelections();
						cleanup();
						resolve("next");
					}
				}),
				quickPick.onDidTriggerButton((button) => {
					if (!isResolved) {
						isResolved = true;
						if (button.tooltip === "Back") {
							cleanup();
							resolve("back");
						} else {
							applySelections();
							cleanup();
							resolve("next");
						}
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

			quickPick.selectedItems = options.filter((o) => o.picked);
			quickPick.show();
		});
	}

	private async askLanguageSpecificSettings(): Promise<"next" | "back" | "cancel"> {
		const langConfig = this.languageConfigs.get(this.config.language);
		if (!langConfig) return "next";

		switch (this.config.language) {
			case "java-jar":
			case "java-war":
				return await this.askJavaSettings(langConfig);
			case "js-frontend":
			case "js-backend":
				return await this.askNodeSettings(langConfig);
			case "python":
				return await this.askPythonSettings(langConfig);
			case "dotnet":
				return await this.askDotNetSettings(langConfig);
			case "go":
				return await this.askGoSettings(langConfig);
			case "rust":
				return await this.askRustSettings(langConfig);
			case "laravel":
				return await this.askPHPSettings(langConfig);
			case "rails":
				return await this.askRubySettings(langConfig);
			case "cpp":
			case "c":
				return await this.askGCCSettings(langConfig);
			default:
				return "next";
		}
	}

	private async askJavaSettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		const typeConfig = langConfig.types?.find((t: any) => t.type === this.config.language);
		const buildTools = typeConfig?.buildTools || [];

		if (buildTools.length > 0) {
			const buildToolItems = buildTools.map((bt: any) => ({
				label: `$(${bt.icon}) ${bt.label}`,
				description: bt.description,
				detail: bt.detail,
				value: bt.value,
			}));

			const buildTool = await this.showQuickPickWithBack("Select Build Tool", buildToolItems);
			if (buildTool === "back") return "back";
			if (buildTool === "cancel") return "cancel";
			if (buildTool?.value) this.config.buildTool = buildTool.value as "maven" | "gradle";
		}

		const jdkVersions = langConfig.jdkVersions.map((v: any) => ({
			label: `$(${v.icon}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const jdkVersion = await this.showQuickPickWithBack("Select JDK Version", jdkVersions);
		if (jdkVersion === "back") return "back";
		if (jdkVersion === "cancel") return "cancel";
		if (jdkVersion?.value) this.config.jdkVersion = jdkVersion.value;

		const jdkVendors = langConfig.jdkVendors.map((v: any) => ({
			label: `$(${v.icon}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const jdkVendor = await this.showQuickPickWithBack("Select JDK Vendor", jdkVendors);
		if (jdkVendor === "back") return "back";
		if (jdkVendor === "cancel") return "cancel";
		if (jdkVendor?.value) this.config.jdkVendor = jdkVendor.value;

		if (this.config.language === "java-jar" && typeConfig?.frameworks) {
			const frameworks = typeConfig.frameworks.map((f: any) => ({
				label: `$(${f.icon}) ${f.label}`,
				description: f.description,
				detail: f.detail,
				value: f.value,
				healthCheckPath: f.healthCheckPath,
			}));

			const framework = await this.showQuickPickWithBack("Select Java Framework", frameworks);
			if (framework === "back") return "back";
			if (framework === "cancel") return "cancel";
			if (framework) {
				this.config.framework = framework.value;
				this.config.healthCheckPath = framework.healthCheckPath;
			}
		} else if (this.config.language === "java-war" && typeConfig?.servers) {
			const servers = typeConfig.servers.map((s: any) => ({
				label: `$(${s.icon}) ${s.label}`,
				description: s.description,
				detail: s.detail,
				value: s.value,
			}));

			const server = await this.showQuickPickWithBack("Select Application Server", servers);
			if (server === "back") return "back";
			if (server === "cancel") return "cancel";
			if (server?.value) this.config.server = server.value;
		}

		return "next";
	}

	private async askNodeSettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (workspaceFolder) {
			const rootPath = workspaceFolder.uri.fsPath;
			if (await fileExists(path.join(rootPath, "pnpm-lock.yaml"))) {
				this.config.packageManager = "pnpm";
			} else if (await fileExists(path.join(rootPath, "yarn.lock"))) {
				this.config.packageManager = "yarn";
			} else if (await fileExists(path.join(rootPath, "bun.lockb"))) {
				this.config.packageManager = "bun";
			} else {
				this.config.packageManager = "npm";
			}
		}

		const nodeVersions = langConfig.versions.map((v: any) => ({
			label: `$(${v.icon}) ${v.label}`,
			description: v.description === "LTS" ? "$(check) LTS" : v.description,
			detail: v.detail,
			value: v.value,
		}));

		const nodeVersion = await this.showQuickPickWithBack("Select Node.js Version", nodeVersions);
		if (nodeVersion === "back") return "back";
		if (nodeVersion === "cancel") return "cancel";
		if (nodeVersion?.value) this.config.nodeVersion = nodeVersion.value;

		const typeConfig = langConfig.types?.find((t: any) => t.type === this.config.language);
		if (typeConfig?.frameworks) {
			const frameworks = typeConfig.frameworks.map((f: any) => ({
				label: `$(${f.icon}) ${f.label}`,
				description: f.description,
				detail: f.detail,
				value: f.value,
			}));

			const framework = await this.showQuickPickWithBack("Select Framework", frameworks);
			if (framework === "back") return "back";
			if (framework === "cancel") return "cancel";
			if (framework?.value) this.config.framework = framework.value;
		}

		return "next";
	}

	private async askPythonSettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		const frameworks = langConfig.frameworks.map((f: any) => ({
			label: `$(${f.icon}) ${f.label}`,
			description: f.description,
			detail: f.detail,
			value: f.value,
		}));

		const framework = await this.showQuickPickWithBack("Select Python Framework", frameworks);
		if (framework === "back") return "back";
		if (framework === "cancel") return "cancel";
		if (framework?.value) this.config.framework = framework.value;

		const versions = langConfig.versions.map((v: any) => ({
			label: `$(${v.icon}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const version = await this.showQuickPickWithBack("Select Python Version", versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version?.value) this.config.pythonVersion = version.value;

		return "next";
	}

	private async askDotNetSettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		const versions = langConfig.versions.map((v: any) => ({
			label: `$(${v.icon || "tag"}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const version = await this.showQuickPickWithBack("Select .NET Version", versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version?.value) this.config.dotnetVersion = version.value;

		return "next";
	}

	private async askGoSettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		const versions = langConfig.versions.map((v: any) => ({
			label: `$(${v.icon || "tag"}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const version = await this.showQuickPickWithBack("Select Go Version", versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version?.value) this.config.goVersion = version.value;

		return "next";
	}

	private async askRustSettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		const versions = langConfig.versions.map((v: any) => ({
			label: `$(${v.icon || "tag"}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const version = await this.showQuickPickWithBack("Select Rust Version", versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version?.value) this.config.rustVersion = version.value;

		return "next";
	}

	private async askPHPSettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		const versions = langConfig.versions.map((v: any) => ({
			label: `$(${v.icon || "tag"}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const version = await this.showQuickPickWithBack("Select PHP Version", versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version?.value) this.config.phpVersion = version.value;

		return "next";
	}

	private async askRubySettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		const versions = langConfig.versions.map((v: any) => ({
			label: `$(${v.icon || "tag"}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const version = await this.showQuickPickWithBack("Select Ruby Version", versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version?.value) this.config.rubyVersion = version.value;

		return "next";
	}

	private async askGCCSettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		const versions = langConfig.versions.map((v: any) => ({
			label: `$(${v.icon || "tag"}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const version = await this.showQuickPickWithBack("Select GCC Version", versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version?.value) this.config.gccVersion = version.value;

		return "next";
	}

	private async askDatabases(): Promise<"next" | "back" | "cancel"> {
		const databaseManager = new DatabaseManager();
		const result = await databaseManager.selectDatabases(this.currentStep, this.totalSteps);
		if (result === "back") return "back";
		if (result === "cancel") return "cancel";
		this.config.databases = result;
		return "next";
	}

	private async askMessageQueues(): Promise<"next" | "back" | "cancel"> {
		const messageQueueManager = new MessageQueueManager();
		const result = await messageQueueManager.selectMessageQueues(this.currentStep, this.totalSteps);
		if (result === "back") return "back";
		if (result === "cancel") return "cancel";
		this.config.messageQueues = result;
		return "next";
	}

	private async askServices(): Promise<"next" | "back" | "cancel"> {
		const serviceManager = new ServiceManager();
		const result = await serviceManager.selectServices(this.currentStep, this.totalSteps);
		if (result === "back") return "back";
		if (result === "cancel") return "cancel";
		this.config.services = result;
		return "next";
	}

	private showQuickPickWithBack(title: string, items: any[]): Promise<any> {
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${this.currentStep + 1}/${this.totalSteps}: ${title}`;
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

	private async generateFiles(): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			throw new Error("No workspace folder found. Please open a folder first.");
		}

		if (!this.config.projectName) {
			throw new Error("Project name is required");
		}
		if (!this.config.language) {
			throw new Error("Language is required");
		}

		const langConfig = this.languageConfigs.get(this.config.language);
		const dockerfileGenerator = new DockerfileGenerator(this.config, langConfig);
		const dockerComposeGenerator = new DockerComposeGenerator(this.config);
		const dockerignoreGenerator = new DockerignoreGenerator(this.config);

		const workspacePath = workspaceFolder.uri.fsPath;
		const filesToWrite = [
			{ name: "Dockerfile", content: dockerfileGenerator.generate() },
			{ name: "docker-compose.yml", content: dockerComposeGenerator.generate() },
		];

		const generateDockerignore = this.getConfigValue<boolean>("generateDockerignore", true);
		if (generateDockerignore) {
			filesToWrite.push({ name: ".dockerignore", content: dockerignoreGenerator.generate(this.config.language) });
		}

		try {
			const writtenFiles: string[] = [];
			for (const file of filesToWrite) {
				const filePath = path.join(workspacePath, file.name);
				await safeWriteFile(filePath, file.content);
				writtenFiles.push(file.name);
			}

			const showNotification = this.getConfigValue<boolean>("showSuccessNotification", true);
			if (showNotification) {
				const action = await vscode.window.showInformationMessage(`🎉 Docker files generated successfully! (${writtenFiles.join(", ")})`, "Open Dockerfile", "Open docker-compose.yml");

				if (action === "Open Dockerfile") {
					const doc = await vscode.workspace.openTextDocument(path.join(workspacePath, "Dockerfile"));
					await vscode.window.showTextDocument(doc);
				} else if (action === "Open docker-compose.yml") {
					const doc = await vscode.workspace.openTextDocument(path.join(workspacePath, "docker-compose.yml"));
					await vscode.window.showTextDocument(doc);
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			vscode.window.showErrorMessage(`Failed to generate Docker files: ${message}`);
			throw error;
		}
	}
}
