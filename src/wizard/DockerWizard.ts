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

// Import JSON configs directly
// const javaConfig: any = require("../config/languages/java.json");
// const dotnetConfig: any = require("../config/languages/dotnet.json");
// const pythonConfig: any = require("../config/languages/python.json");
// const nodejsConfig: any = require("../config/languages/nodejs.json");
// const rubyConfig: any = require("../config/languages/ruby.json");
// const phpConfig: any = require("../config/languages/php.json");
// const rustConfig: any = require("../config/languages/rust.json");
// const goConfig: any = require("../config/languages/go.json");
// const cppConfig: any = require("../config/languages/cpp.json");
// const cConfig: any = require("../config/languages/c.json");

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

	constructor() {
		this.config = {
			projectName: "",
			language: "",
			port: 8080,
			useAlpine: false,
			enableDebug: false,
			enableHealthCheck: false,
			databases: [],
			messageQueues: [],
			services: [],
		};
	}

	async start(): Promise<void> {
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

		return new Promise((resolve) => {
			const acceptValue = () => {
				if (!isResolved) {
					const value = inputBox.value;
					if (!value || value.length === 0) {
						inputBox.validationMessage = "Project name cannot be empty";
						return;
					}
					if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
						inputBox.validationMessage = "Project name can only contain letters, numbers, hyphens, and underscores";
						return;
					}
					isResolved = true;
					this.config.projectName = value;
					inputBox.dispose();
					resolve("next");
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

	private async askLanguage(): Promise<"next" | "back" | "cancel"> {
		const languageConfigs: any[] = [javaConfig, dotnetConfig, pythonConfig, nodejsConfig, rubyConfig, phpConfig, rustConfig, goConfig, cppConfig, cConfig];

		const languages: any[] = [];

		for (const config of languageConfigs) {
			if (config.types) {
				for (const type of config.types) {
					languages.push({
						label: `$(${type.icon}) ${type.label}`,
						description: type.description,
						detail: type.detail,
						value: type.type,
						config: config,
					});
				}
			} else {
				languages.push({
					label: `$(${config.icon}) ${config.label}`,
					description: config.description,
					detail: config.detail,
					value: config.type,
					config: config,
				});
			}
		}

		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${this.currentStep + 1}/${this.totalSteps}: Select Language`;
		quickPick.placeholder = "Select your project language/framework";
		quickPick.items = languages;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.buttons = [{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" }];

		let isResolved = false;

		return new Promise((resolve) => {
			quickPick.onDidAccept(() => {
				if (!isResolved) {
					const selected = quickPick.selectedItems[0] as any;
					if (selected) {
						isResolved = true;
						this.config.language = selected.value;
						this.languageConfigs.set(selected.value, selected.config);
						quickPick.dispose();
						resolve("next");
					}
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

	private async askPort(): Promise<"next" | "back" | "cancel"> {
		const inputBox = vscode.window.createInputBox();
		inputBox.title = `Step ${this.currentStep + 1}/${this.totalSteps}: Application Port`;
		inputBox.prompt = "Enter application port (1-65535)";
		inputBox.placeholder = "8080";
		inputBox.value = "8080";
		inputBox.buttons = [
			{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" },
			{ iconPath: new vscode.ThemeIcon("check"), tooltip: "OK" },
		];

		let isResolved = false;

		return new Promise((resolve) => {
			const acceptValue = () => {
				if (!isResolved) {
					const value = inputBox.value;
					const portNum = parseInt(value);
					if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
						inputBox.validationMessage = "Please enter a valid port number (1-65535)";
						return;
					}
					isResolved = true;
					this.config.port = portNum;
					inputBox.dispose();
					resolve("next");
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

	private async askGeneralOptions(): Promise<"next" | "back" | "cancel"> {
		const options = [
			{
				label: "$(package) Use Alpine",
				description: "Smaller image size (where available)",
				detail: "Uses Alpine-based images for reduced container size",
				picked: false,
			},
			{
				label: "$(bug) Enable Debug",
				description: "Debug on port 5005",
				detail: "Enables JDWP debug mode for remote debugging",
				picked: false,
			},
			{
				label: "$(pulse) Enable Health Check",
				description: "Health check endpoint",
				detail: "Adds HEALTHCHECK to monitor application status",
				picked: false,
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

		const applySelections = () => {
			const selected = quickPick.selectedItems;
			this.config.useAlpine = selected.some((o) => o.label.includes("Alpine"));
			this.config.enableDebug = selected.some((o) => o.label.includes("Debug"));
			this.config.enableHealthCheck = selected.some((o) => o.label.includes("Health"));
		};

		return new Promise((resolve) => {
			quickPick.onDidAccept(() => {
				if (!isResolved) {
					isResolved = true;
					applySelections();
					quickPick.dispose();
					resolve("next");
				}
			});

			quickPick.onDidTriggerButton((button) => {
				if (!isResolved) {
					isResolved = true;
					quickPick.dispose();
					if (button.tooltip === "Back") {
						resolve("back");
					} else {
						applySelections();
						resolve("next");
					}
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
				return await this.askVersionSettings(langConfig, ".NET Version");
			case "go":
				return await this.askVersionSettings(langConfig, "Go Version");
			case "rust":
				return await this.askVersionSettings(langConfig, "Rust Version");
			case "laravel":
				return await this.askVersionSettings(langConfig, "PHP Version");
			case "rails":
				return await this.askVersionSettings(langConfig, "Ruby Version");
			case "cpp":
				return await this.askVersionSettings(langConfig, "GCC Version");
			case "c":
				return await this.askVersionSettings(langConfig, "GCC Version");
			default:
				return "next";
		}
	}

	private async askJavaSettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		// Build tool
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
			if (buildTool) this.config.buildTool = buildTool.value as "maven" | "gradle";
		}

		// JDK Version
		const jdkVersions = langConfig.jdkVersions.map((v: any) => ({
			label: `$(${v.icon}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const jdkVersion = await this.showQuickPickWithBack("Select JDK Version", jdkVersions);
		if (jdkVersion === "back") return "back";
		if (jdkVersion === "cancel") return "cancel";
		if (jdkVersion) this.config.jdkVersion = jdkVersion.value;

		// JDK Vendor
		const jdkVendors = langConfig.jdkVendors.map((v: any) => ({
			label: `$(${v.icon}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const jdkVendor = await this.showQuickPickWithBack("Select JDK Vendor", jdkVendors);
		if (jdkVendor === "back") return "back";
		if (jdkVendor === "cancel") return "cancel";
		if (jdkVendor) this.config.jdkVendor = jdkVendor.value;

		// Framework or Server
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
			if (server) this.config.server = server.value;
		}

		return "next";
	}

	private async askNodeSettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		// Node version
		const nodeVersions = langConfig.versions.map((v: any) => ({
			label: `$(${v.icon}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const nodeVersion = await this.showQuickPickWithBack("Select Node.js Version", nodeVersions);
		if (nodeVersion === "back") return "back";
		if (nodeVersion === "cancel") return "cancel";
		if (nodeVersion) this.config.nodeVersion = nodeVersion.value;

		// Framework
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
			if (framework) this.config.framework = framework.value;
		}

		return "next";
	}

	private async askPythonSettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		// Framework
		const frameworks = langConfig.frameworks.map((f: any) => ({
			label: `$(${f.icon}) ${f.label}`,
			description: f.description,
			detail: f.detail,
			value: f.value,
		}));

		const framework = await this.showQuickPickWithBack("Select Python Framework", frameworks);
		if (framework === "back") return "back";
		if (framework === "cancel") return "cancel";
		if (framework) this.config.framework = framework.value;

		// Python version
		const versions = langConfig.versions.map((v: any) => ({
			label: `$(${v.icon}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const version = await this.showQuickPickWithBack("Select Python Version", versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version) this.config.pythonVersion = version.value;

		return "next";
	}

	private async askVersionSettings(langConfig: any, title: string): Promise<"next" | "back" | "cancel"> {
		const versions = langConfig.versions.map((v: any) => ({
			label: `$(${v.icon || "tag"}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		const version = await this.showQuickPickWithBack(`Select ${title}`, versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version) this.config.framework = version.value;

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

	private async generateFiles(): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			throw new Error("No workspace folder found. Please open a folder first.");
		}

		const langConfig = this.languageConfigs.get(this.config.language);
		const dockerfileGenerator = new DockerfileGenerator(this.config, langConfig);
		const dockerComposeGenerator = new DockerComposeGenerator(this.config);
		const dockerignoreGenerator = new DockerignoreGenerator(this.config);

		try {
			const dockerfile = dockerfileGenerator.generate();
			await fs.writeFile(path.join(workspaceFolder.uri.fsPath, "Dockerfile"), dockerfile);

			const dockerCompose = dockerComposeGenerator.generate();
			await fs.writeFile(path.join(workspaceFolder.uri.fsPath, "docker-compose.yml"), dockerCompose);

			const dockerignore = dockerignoreGenerator.generate();
			await fs.writeFile(path.join(workspaceFolder.uri.fsPath, ".dockerignore"), dockerignore);

			const action = await vscode.window.showInformationMessage("🎉 Docker files generated successfully!", "Open Dockerfile", "Open docker-compose.yml");

			if (action === "Open Dockerfile") {
				const doc = await vscode.workspace.openTextDocument(path.join(workspaceFolder.uri.fsPath, "Dockerfile"));
				await vscode.window.showTextDocument(doc);
			} else if (action === "Open docker-compose.yml") {
				const doc = await vscode.workspace.openTextDocument(path.join(workspaceFolder.uri.fsPath, "docker-compose.yml"));
				await vscode.window.showTextDocument(doc);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			vscode.window.showErrorMessage(`Failed to generate Docker files: ${message}`);
			throw error;
		}
	}
}
