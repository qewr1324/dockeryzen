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
import { EnvFileGenerator } from "../generators/EnvFileGenerator.js";
import { GitHubWorkflowGenerator } from "../generators/GitHubWorkflowGenerator.js";
import { GitLabCIGenerator } from "../generators/GitLabCIGenerator.js";
import { DockerComposeOverrideGenerator } from "../generators/DockerComposeOverrideGenerator.js";
import { validatePort, validateProjectName, fileExists, safeWriteFile, isPortAvailable, findFreePort } from "../utils/helpers.js";

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

import { NginxConfigGenerator } from "../generators/NginxConfigGenerator.js";
import { PrometheusConfigGenerator } from "../generators/PrometheusConfigGenerator.js";

/**
 * DockerWizard class - Main wizard for generating Docker configuration
 * Handles the entire flow from project name to file generation
 */
export class DockerWizard {
	private config: ProjectConfig;
	private currentStep: number = 0;
	private totalSteps: number = 8;
	private languageConfigs: Map<string, any> = new Map();
	private wizardState: Map<string, any> = new Map();
	private context: vscode.ExtensionContext;
	private timeoutId: NodeJS.Timeout | null = null;

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
			restartPolicy: "unless-stopped",
			networkDriver: "bridge",
			enableRedis: false,
			enableSidekiq: false,
			enableQueueWorker: false,
			useVirtualEnv: true,
			cgoEnabled: true,
			enableNginx: false,
			enableGunicorn: false,
			enablePm2: false,
			enableCelery: false,
			enableHorizon: false,
			databases: [],
			messageQueues: [],
			services: [],
		};
		this.loadState();
	}

	/**
	 * Get a configuration value from VSCode settings
	 */
	private getConfigValue<T>(key: string, defaultValue: T): T {
		try {
			const config = vscode.workspace.getConfiguration("dockeryzen");
			return config.get<T>(key, defaultValue);
		} catch {
			return defaultValue;
		}
	}

	/**
	 * Save wizard state to workspace
	 */
	private async saveState(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (workspaceFolder) {
				const statePath = path.join(workspaceFolder.uri.fsPath, ".dockeryzen-state.json");
				await fs.writeFile(statePath, JSON.stringify(this.config, null, 2));
			}
		} catch (error) {
			console.error("Failed to save state:", error);
		}
	}

	/**
	 * Load wizard state from workspace
	 */
	private async loadState(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (workspaceFolder) {
				const statePath = path.join(workspaceFolder.uri.fsPath, ".dockeryzen-state.json");
				if (await fileExists(statePath)) {
					const savedState = await fs.readFile(statePath, "utf8");
					const parsedState = JSON.parse(savedState);
					Object.assign(this.config, parsedState);
				}
			}
		} catch (error) {
			console.error("Failed to load state:", error);
		}
	}

	/**
	 * Start the wizard
	 */
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

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Dockeryzen",
				cancellable: true,
			},
			async (progress, token) => {
				token.onCancellationRequested(() => {
					vscode.window.showInformationMessage("❌ Operation cancelled by user");
					throw new Error("Operation cancelled by user");
				});

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
					const stepKey = `step_${this.currentStep}`;

					progress.report({
						message: `Step ${this.currentStep + 1}/${this.totalSteps}: ${step.name}`,
						increment: Math.round((this.currentStep / this.totalSteps) * 100),
					});

					if (this.wizardState.has(stepKey)) {
						const savedState = this.wizardState.get(stepKey);
						Object.assign(this.config, savedState);
					}

					try {
						const result = await this.withTimeout(() => step.fn(), 300000);

						if (result === "back") {
							this.currentStep = Math.max(0, this.currentStep - 1);
							continue;
						}

						if (result === "cancel") {
							vscode.window.showInformationMessage("❌ Operation cancelled by user");
							return;
						}

						this.wizardState.set(stepKey, { ...this.config });
						await this.saveState();
						this.currentStep++;
					} catch (error) {
						if (error instanceof Error && error.message === "Timeout") {
							vscode.window.showWarningMessage("Operation timed out. Please try again.");
							return;
						}
						const message = error instanceof Error ? error.message : "Unknown error";
						vscode.window.showErrorMessage(`Error in step "${step.name}": ${message}`);
						return;
					}
				}

				await this.generateFiles();
			},
		);
	}

	/**
	 * Execute a function with timeout
	 */
	private async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
		return Promise.race([
			fn(),
			new Promise<T>((_, reject) => {
				this.timeoutId = setTimeout(() => {
					reject(new Error("Timeout"));
				}, timeoutMs);
			}),
		]).finally(() => {
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = null;
			}
		});
	}

	/**
	 * Ask for project name
	 */
	private async askProjectName(): Promise<"next" | "back" | "cancel"> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const defaultName = workspaceFolder ? path.basename(workspaceFolder.uri.fsPath) : "my-project";

		const inputBox = vscode.window.createInputBox();
		inputBox.title = `Step ${this.currentStep + 1}/${this.totalSteps}: Project Name`;
		inputBox.prompt = "Enter project name (e.g., my-awesome-app)";
		inputBox.placeholder = "my-awesome-app";
		inputBox.value = this.config.projectName || defaultName;
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

	/**
	 * Ask for language selection with auto-detection
	 */
	private async askLanguage(): Promise<"next" | "back" | "cancel"> {
		const detectedLanguage = await this.detectLanguage();

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
							picked: type.type === detectedLanguage,
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
						picked: config.type === detectedLanguage,
					});
				}
			}
		}

		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${this.currentStep + 1}/${this.totalSteps}: Select Language`;
		quickPick.placeholder = detectedLanguage ? `Detected: ${detectedLanguage}. Type to search or press Enter to confirm` : "Select your project language/framework (type to search)";
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

	/**
	 * Detect language from workspace files
	 */
	private async detectLanguage(): Promise<string | null> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) return null;

		const rootPath = workspaceFolder.uri.fsPath;

		const checks: Array<[string, string]> = [
			["java-jar", "pom.xml"],
			["java-jar", "build.gradle"],
			["java-jar", "build.gradle.kts"],
			["java-war", "web.xml"],
			["js-frontend", "next.config.js"],
			["js-frontend", "angular.json"],
			["js-frontend", "nuxt.config.js"],
			["js-backend", "package.json"],
			["python", "requirements.txt"],
			["python", "pyproject.toml"],
			["python", "setup.py"],
			["go", "go.mod"],
			["rust", "Cargo.toml"],
			["dotnet", "*.csproj"],
			["laravel", "artisan"],
			["rails", "Gemfile"],
			["cpp", "CMakeLists.txt"],
			["c", "Makefile"],
		];

		for (const [lang, file] of checks) {
			if (file.includes("*")) {
				const pattern = file.replace("*", "");
				const files = await fs.readdir(rootPath);
				if (files.some((f) => f.endsWith(pattern))) {
					return lang;
				}
			} else if (await fileExists(path.join(rootPath, file))) {
				return lang;
			}
		}

		return null;
	}

	/**
	 * Ask for port with dynamic suggestion
	 */
	private async askPort(): Promise<"next" | "back" | "cancel"> {
		const defaultPort = this.getConfigValue<number>("defaultPort", 8080);

		const portAvailable = await isPortAvailable(defaultPort);
		const suggestedPort = portAvailable ? defaultPort : findFreePort(defaultPort, new Set([defaultPort]));

		const inputBox = vscode.window.createInputBox();
		inputBox.title = `Step ${this.currentStep + 1}/${this.totalSteps}: Application Port`;
		inputBox.prompt = portAvailable ? `Enter application port (1-65535). Port ${defaultPort} is available` : `Port ${defaultPort} is in use. Suggested port: ${suggestedPort}`;
		inputBox.placeholder = "8080";
		inputBox.value = (this.config.port || suggestedPort).toString();
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

	/**
	 * Ask for general options - language-specific options only
	 */
	private async askGeneralOptions(): Promise<"next" | "back" | "cancel"> {
		const options: any[] = [
			{
				label: "$(package) Use Alpine",
				description: "Smaller image size (where available)",
				detail: "Uses Alpine-based images. Warning: May not be compatible with all native modules",
				picked: this.config.useAlpine,
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

		// Python-specific options
		if (this.config.language === "python") {
			options.push({
				label: "$(terminal) Use Virtual Environment",
				description: "Use Python virtual environment",
				detail: "Recommended for Python projects",
				picked: this.config.useVirtualEnv,
			});
			options.push({
				label: "$(server) Use Gunicorn",
				description: "Use Gunicorn WSGI server",
				detail: "Production-grade server for Django/Flask",
				picked: this.config.enableGunicorn,
			});
		}

		// Redis for Rails, Laravel, Node.js
		if (this.config.language === "rails" || this.config.language === "laravel" || this.config.language.startsWith("js")) {
			options.push({
				label: "$(database) Enable Redis",
				description: "Add Redis for caching/background jobs",
				detail: "Useful for Rails Sidekiq, Laravel queues, etc.",
				picked: this.config.enableRedis,
			});
		}

		// Queue Worker for Rails and Laravel
		if (this.config.language === "rails" || this.config.language === "laravel") {
			options.push({
				label: "$(sync) Enable Queue Worker",
				description: "Add queue worker for background jobs",
				detail: "For Laravel queue, Rails Sidekiq, etc.",
				picked: this.config.enableQueueWorker,
			});
		}

		// CGO for Go
		if (this.config.language === "go") {
			options.push({
				label: "$(tools) Enable CGO",
				description: "Enable CGO for C dependencies",
				detail: "Required for SQLite and some other packages",
				picked: this.config.cgoEnabled,
			});
		}

		// Nginx for Laravel
		if (this.config.language === "laravel") {
			options.push({
				label: "$(globe) Enable Nginx",
				description: "Add Nginx reverse proxy",
				detail: "Required for Laravel PHP-FPM setup",
				picked: this.config.enableNginx,
			});
		}

		// PM2 for Node.js
		if (this.config.language.startsWith("js")) {
			options.push({
				label: "$(server) Use PM2",
				description: "Use PM2 process manager",
				detail: "Production-grade process manager for Node.js",
				picked: this.config.enablePm2,
			});
		}

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

			if (this.config.language === "python") {
				this.config.useVirtualEnv = selected.some((o) => o.label.includes("Virtual Environment"));
				this.config.enableGunicorn = selected.some((o) => o.label.includes("Gunicorn"));
			}

			if (this.config.language === "rails" || this.config.language === "laravel" || this.config.language.startsWith("js")) {
				this.config.enableRedis = selected.some((o) => o.label.includes("Redis"));
			}

			if (this.config.language === "rails" || this.config.language === "laravel") {
				this.config.enableQueueWorker = selected.some((o) => o.label.includes("Queue Worker"));
			}

			if (this.config.language === "go") {
				this.config.cgoEnabled = selected.some((o) => o.label.includes("CGO"));
			}

			if (this.config.language === "laravel") {
				this.config.enableNginx = selected.some((o) => o.label.includes("Nginx"));
			}

			if (this.config.language.startsWith("js")) {
				this.config.enablePm2 = selected.some((o) => o.label.includes("PM2"));
			}

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

	/**
	 * Ask for language-specific settings
	 */
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

	/**
	 * Ask for Java-specific settings
	 */
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

		// JDK Version with custom option - filter incompatible versions
		const availableJdkVersions = langConfig.jdkVersions.filter((v: any) => {
			if (this.config.buildTool === "gradle" && v.value === "8") return false;
			if (this.config.buildTool === "gradle" && v.value === "25") return false;
			if (this.config.buildTool === "maven" && v.value === "25") return false;
			return true;
		});

		const jdkVersions = availableJdkVersions.map((v: any) => ({
			label: `$(${v.icon}) ${v.label}`,
			description: v.description,
			detail: v.detail,
			value: v.value,
		}));

		jdkVersions.push({
			label: "$(edit) Custom JDK Version",
			description: "Enter a custom JDK version",
			detail: "For advanced users",
			value: "custom",
		});

		const jdkVersion = await this.showQuickPickWithBack("Select JDK Version", jdkVersions);
		if (jdkVersion === "back") return "back";
		if (jdkVersion === "cancel") return "cancel";

		if (jdkVersion?.value === "custom") {
			const customVersion = await this.showInputBoxWithBack("Enter Custom JDK Version", this.config.jdkVersion || "21", "Enter JDK version (e.g., 21, 22, 23)");
			if (customVersion === "back") return "back";
			if (customVersion === "cancel") return "cancel";
			if (customVersion && /^\d+$/.test(customVersion)) {
				this.config.jdkVersion = customVersion;
			}
		} else if (jdkVersion?.value) {
			this.config.jdkVersion = jdkVersion.value;
		}

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
		if (jdkVendor?.value) this.config.jdkVendor = jdkVendor.value;

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
			if (server?.value) this.config.server = server.value;
		}

		return "next";
	}

	/**
	 * Ask for Node.js settings
	 */
	private async askNodeSettings(langConfig: any): Promise<"next" | "back" | "cancel"> {
		// Detect package manager
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (workspaceFolder) {
			const rootPath = workspaceFolder.uri.fsPath;
			if (await fileExists(path.join(rootPath, "pnpm-lock.yaml"))) {
				this.config.packageManager = "pnpm";
			} else if (await fileExists(path.join(rootPath, "yarn.lock"))) {
				this.config.packageManager = "yarn";
			} else if (await fileExists(path.join(rootPath, "bun.lockb"))) {
				this.config.packageManager = "bun";
			} else if (await fileExists(path.join(rootPath, "deno.json"))) {
				this.config.packageManager = "deno";
			} else {
				this.config.packageManager = "npm";
			}
		}

		// Node version with LTS distinction
		const framework = this.config.framework;
		const availableVersions = langConfig.versions.filter((v: any) => {
			if (framework === "angular" && parseInt(v.value) < 18) return false;
			if (framework === "nextjs" && parseInt(v.value) < 18) return false;
			return true;
		});

		const nodeVersions = availableVersions.map((v: any) => ({
			label: `$(${v.icon}) ${v.label}`,
			description: v.description === "LTS" ? "$(check) LTS" : v.description,
			detail: v.detail,
			value: v.value,
		}));

		const nodeVersion = await this.showQuickPickWithBack("Select Node.js Version", nodeVersions);
		if (nodeVersion === "back") return "back";
		if (nodeVersion === "cancel") return "cancel";
		if (nodeVersion?.value) this.config.nodeVersion = nodeVersion.value;

		// Framework
		const typeConfig = langConfig.types?.find((t: any) => t.type === this.config.language);
		if (typeConfig?.frameworks) {
			const frameworks = typeConfig.frameworks.map((f: any) => ({
				label: `$(${f.icon}) ${f.label}`,
				description: f.description,
				detail: f.detail,
				value: f.value,
			}));

			const frameworkPick = await this.showQuickPickWithBack("Select Framework", frameworks);
			if (frameworkPick === "back") return "back";
			if (frameworkPick === "cancel") return "cancel";
			if (frameworkPick?.value) this.config.framework = frameworkPick.value;
		}

		return "next";
	}

	/**
	 * Ask for Python settings
	 */
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

	/**
	 * Ask for .NET settings
	 */
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

	/**
	 * Ask for Go settings
	 */
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

	/**
	 * Ask for Rust settings
	 */
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

	/**
	 * Ask for PHP settings
	 */
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

	/**
	 * Ask for Ruby settings
	 */
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

	/**
	 * Ask for GCC settings
	 */
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

	/**
	 * Ask for databases
	 */
	private async askDatabases(): Promise<"next" | "back" | "cancel"> {
		const databaseManager = new DatabaseManager();
		const result = await databaseManager.selectDatabases(this.currentStep, this.totalSteps);
		if (result === "back") return "back";
		if (result === "cancel") return "cancel";
		this.config.databases = result;
		return "next";
	}

	/**
	 * Ask for message queues
	 */
	private async askMessageQueues(): Promise<"next" | "back" | "cancel"> {
		const messageQueueManager = new MessageQueueManager();
		const result = await messageQueueManager.selectMessageQueues(this.currentStep, this.totalSteps);
		if (result === "back") return "back";
		if (result === "cancel") return "cancel";
		this.config.messageQueues = result;
		return "next";
	}

	/**
	 * Ask for additional services
	 */
	private async askServices(): Promise<"next" | "back" | "cancel"> {
		const serviceManager = new ServiceManager();
		const result = await serviceManager.selectServices(this.currentStep, this.totalSteps);
		if (result === "back") return "back";
		if (result === "cancel") return "cancel";
		this.config.services = result;
		return "next";
	}

	/**
	 * Show quick pick with back button
	 */
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

	/**
	 * Show input box with back button
	 */
	private showInputBoxWithBack(title: string, value: string, prompt?: string): Promise<string | "back" | "cancel"> {
		const inputBox = vscode.window.createInputBox();
		inputBox.title = `Step ${this.currentStep + 1}/${this.totalSteps}: ${title}`;
		inputBox.value = value;
		if (prompt) inputBox.prompt = prompt;
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

	/**
	 * Generate all Docker files
	 */
	// ===== import های جدید در بالای فایل =====
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
		const envFileGenerator = new EnvFileGenerator(this.config);
		const githubWorkflowGenerator = new GitHubWorkflowGenerator(this.config);
		const gitlabCIGenerator = new GitLabCIGenerator(this.config);
		const dockerComposeOverrideGenerator = new DockerComposeOverrideGenerator(this.config);
		const nginxConfigGenerator = new NginxConfigGenerator(this.config);
		const prometheusConfigGenerator = new PrometheusConfigGenerator(this.config);

		const workspacePath = workspaceFolder.uri.fsPath;

		const filesToWrite: Array<{ name: string; content: string }> = [
			{ name: "Dockerfile", content: dockerfileGenerator.generate() },
			{ name: "docker-compose.yml", content: dockerComposeGenerator.generate() },
		];

		const generateDockerignore = this.getConfigValue<boolean>("generateDockerignore", true);
		if (generateDockerignore) {
			filesToWrite.push({ name: ".dockerignore", content: dockerignoreGenerator.generate(this.config.language) });
		}

		filesToWrite.push({ name: ".env.example", content: envFileGenerator.generate() });

		// Fix bug 481-482: Generate nginx.conf and prometheus.yml when needed
		if (this.config.language === "laravel" && this.config.enableNginx) {
			filesToWrite.push({ name: "nginx.conf", content: nginxConfigGenerator.generate() });
		}

		if (this.config.enableHealthCheck) {
			filesToWrite.push({ name: "prometheus.yml", content: prometheusConfigGenerator.generate() });
		}

		if (this.config.enableDebug) {
			filesToWrite.push({ name: "docker-compose.override.yml", content: dockerComposeOverrideGenerator.generate() });
		}

		filesToWrite.push({
			name: path.join(".github", "workflows", "docker-build.yml"),
			content: githubWorkflowGenerator.generate(),
		});
		filesToWrite.push({
			name: ".gitlab-ci.yml",
			content: gitlabCIGenerator.generate(),
		});

		try {
			const writtenFiles: string[] = [];
			for (const file of filesToWrite) {
				const filePath = path.join(workspacePath, file.name);
				const dir = path.dirname(filePath);
				await fs.ensureDir(dir);
				await safeWriteFile(filePath, file.content);
				writtenFiles.push(file.name);
			}

			const statePath = path.join(workspacePath, ".dockeryzen-state.json");
			if (await fileExists(statePath)) {
				await fs.remove(statePath);
			}

			const showNotification = this.getConfigValue<boolean>("showSuccessNotification", true);
			if (showNotification) {
				const action = await vscode.window.showInformationMessage(`🎉 Docker files generated successfully! (${writtenFiles.length} files)`, "Open Dockerfile", "Open docker-compose.yml");

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
