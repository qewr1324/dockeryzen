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

		// NEW: تنظیمات پیش‌فرض CI/CD
		this.wizardState.set("ci_cd_config", {
			generateGitHubActions: true,
			generateGitLabCI: true,
			generatePrometheus: false,
		});

		this.loadState();
	}

	private getConfigValue<T>(key: string, defaultValue: T): T {
		try {
			const config = vscode.workspace.getConfiguration("dockeryzen");
			return config.get<T>(key, defaultValue);
		} catch {
			return defaultValue;
		}
	}

	private async saveState(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (workspaceFolder) {
				const statePath = path.join(workspaceFolder.uri.fsPath, ".dockeryzen-state.json");
				await fs.writeFile(statePath, JSON.stringify(this.config, null, 2));
			} else {
				console.warn("No workspace folder found, state not saved");
			}
		} catch (error) {
			console.error("Failed to save state:", error);
		}
	}

	private async loadState(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (workspaceFolder) {
				const statePath = path.join(workspaceFolder.uri.fsPath, ".dockeryzen-state.json");
				if (await fileExists(statePath)) {
					try {
						const savedState = await fs.readFile(statePath, "utf8");
						const parsedState = JSON.parse(savedState);

						const expectedProjectName = path.basename(workspaceFolder.uri.fsPath);
						if (parsedState.projectName && parsedState.projectName !== expectedProjectName) {
							console.warn("State file is from a different project, ignoring");
							return;
						}

						Object.assign(this.config, parsedState);
					} catch (parseError) {
						console.warn("Failed to parse state file, using defaults:", parseError);
					}
				}
			}
		} catch (error) {
			console.error("Failed to load state:", error);
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

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Dockeryzen",
				cancellable: true,
			},
			async (progress, token) => {
				let isCancelled = false;
				token.onCancellationRequested(() => {
					isCancelled = true;
					vscode.window.showInformationMessage("❌ Operation cancelled by user");
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
					{ name: "CI/CD & Monitoring", fn: () => this.askCICDAndMonitoring() },
				];

				// باگ 687: totalSteps داینامیک
				this.totalSteps = steps.length;

				this.currentStep = 0;
				while (this.currentStep < steps.length && !isCancelled) {
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

				if (isCancelled) {
					return;
				}

				await this.generateFiles();
			},
		);
	}

	private async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
		let timeoutId: NodeJS.Timeout | null = null;
		try {
			return await Promise.race([
				fn(),
				new Promise<T>((_, reject) => {
					timeoutId = setTimeout(() => {
						reject(new Error("Timeout"));
					}, timeoutMs);
				}),
			]);
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		}
	}

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
			const acceptValue = async () => {
				if (!isResolved) {
					const value = inputBox.value;
					const validation = validateProjectName(value);
					if (validation) {
						inputBox.validationMessage = validation;
						return;
					}

					// باگ 679: بررسی وجود فایل‌های Docker قبلی
					const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
					if (workspaceFolder) {
						const dockerfilePath = path.join(workspaceFolder.uri.fsPath, "Dockerfile");
						const composePath = path.join(workspaceFolder.uri.fsPath, "docker-compose.yml");
						if ((await fileExists(dockerfilePath)) || (await fileExists(composePath))) {
							const proceed = await vscode.window.showWarningMessage("Docker files already exist in this workspace. Overwrite?", "Yes", "No");
							if (proceed !== "Yes") {
								return;
							}
						}
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
		const detectedLanguages = await this.detectLanguages();
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
							picked: detectedLanguages.includes(type.type),
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
						picked: detectedLanguages.includes(config.type),
					});
				}
			}
		}

		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${this.currentStep + 1}/${this.totalSteps}: Select Language`;
		quickPick.placeholder = detectedLanguages.length > 0 ? `Detected: ${detectedLanguages.join(", ")}. Type to search or press Enter to confirm` : "Select your project language/framework (type to search)";
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
							this.config.debugPort = undefined;
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

	private async detectLanguages(): Promise<string[]> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) return [];
		const rootPath = workspaceFolder.uri.fsPath;
		const detected: string[] = [];

		// باگ 603: بررسی package.json برای تشخیص frontend/backend
		const packageJsonPath = path.join(rootPath, "package.json");
		if (await fileExists(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
				const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

				if (deps["next"] || deps["react"] || deps["vue"] || deps["@angular/core"] || deps["nuxt"]) {
					detected.push("js-frontend");
				} else if (deps["express"] || deps["@nestjs/core"] || deps["fastify"] || deps["koa"]) {
					detected.push("js-backend");
				} else if (packageJson.scripts?.build && !packageJson.scripts?.start) {
					detected.push("js-frontend");
				} else if (packageJson.scripts?.start) {
					detected.push("js-backend");
				} else {
					detected.push("js-backend");
				}
			} catch {
				detected.push("js-backend");
			}
		}

		const checks: Array<[string, string]> = [
			["java-jar", "pom.xml"],
			["java-jar", "build.gradle"],
			["java-jar", "build.gradle.kts"],
			["java-war", "web.xml"],
			["js-frontend", "next.config.js"],
			["js-frontend", "angular.json"],
			["js-frontend", "nuxt.config.js"],
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
			if (lang === "js-backend" || lang === "js-frontend") continue; // قبلاً بررسی شده
			if (file.includes("*")) {
				const pattern = file.replace("*", "");
				const files = await fs.readdir(rootPath);
				if (files.some((f) => f.endsWith(pattern))) {
					detected.push(lang);
				}
			} else if (await fileExists(path.join(rootPath, file))) {
				detected.push(lang);
			}
		}
		return detected;
	}

	private async askPort(): Promise<"next" | "back" | "cancel"> {
		const defaultPort = this.getConfigValue<number>("defaultPort", 8080);
		const portAvailable = await isPortAvailable(defaultPort);
		const usedPorts = new Set<number>([defaultPort]);
		const suggestedPort = portAvailable ? defaultPort : findFreePort(defaultPort, usedPorts);
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

	private async askGeneralOptions(): Promise<"next" | "back" | "cancel"> {
		// باگ 604: ذخیره state قبلی برای بازیابی بعد از back
		const previousState = {
			useAlpine: this.config.useAlpine,
			enableDebug: this.config.enableDebug,
			enableHealthCheck: this.config.enableHealthCheck,
			useVirtualEnv: this.config.useVirtualEnv,
			enableGunicorn: this.config.enableGunicorn,
			enableRedis: this.config.enableRedis,
			enableQueueWorker: this.config.enableQueueWorker,
			cgoEnabled: this.config.cgoEnabled,
			enableNginx: this.config.enableNginx,
			enablePm2: this.config.enablePm2,
		};

		const options: any[] = [
			{ label: "$(package) Use Alpine", description: "Smaller image size (where available)", detail: "Uses Alpine-based images. Warning: May not be compatible with all native modules", picked: this.config.useAlpine },
			{ label: "$(bug) Enable Debug", description: `Debug on port ${this.config.debugPort || 5005}`, detail: "Enables remote debugging", picked: this.config.enableDebug },
			{ label: "$(pulse) Enable Health Check", description: "Health check endpoint", detail: "Adds HEALTHCHECK to monitor application status", picked: this.config.enableHealthCheck },
		];

		if (this.config.language === "python") {
			options.push(
				{ label: "$(terminal) Use Virtual Environment", description: "Use Python virtual environment", detail: "Recommended for Python projects", picked: this.config.useVirtualEnv },
				{ label: "$(server) Use Gunicorn", description: "Use Gunicorn WSGI server", detail: "Production-grade server for Django/Flask", picked: this.config.enableGunicorn },
			);
		}

		if (this.config.language === "rails" || this.config.language === "laravel" || this.config.language === "js-backend") {
			options.push({ label: "$(database) Enable Redis", description: "Add Redis for caching/background jobs", detail: "Useful for Rails Sidekiq, Laravel queues, etc.", picked: this.config.enableRedis });
		}

		if (this.config.language === "rails" || this.config.language === "laravel") {
			options.push({ label: "$(sync) Enable Queue Worker", description: "Add queue worker for background jobs", detail: "For Laravel queue, Rails Sidekiq, etc.", picked: this.config.enableQueueWorker });
		}

		if (this.config.language === "go") {
			options.push({ label: "$(tools) Enable CGO", description: "Enable CGO for C dependencies", detail: "Required for SQLite and some other packages", picked: this.config.cgoEnabled });
		}

		if (this.config.language === "laravel") {
			options.push({ label: "$(globe) Enable Nginx", description: "Add Nginx reverse proxy", detail: "Required for Laravel PHP-FPM setup", picked: this.config.enableNginx });
		}

		if (this.config.language === "js-backend") {
			options.push({ label: "$(server) Use PM2", description: "Use PM2 process manager", detail: "Production-grade process manager for Node.js", picked: this.config.enablePm2 });
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
			if (this.config.language === "rails" || this.config.language === "laravel" || this.config.language === "js-backend") {
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
			if (this.config.language === "js-backend") {
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
							// باگ 604: بازیابی state قبلی
							Object.assign(this.config, previousState);
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
		if (!langConfig) {
			// باگ 643: به جای next، برگردوندن back
			console.warn(`No language config found for: ${this.config.language}`);
			return "back";
		}
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
				console.warn(`Unhandled language: ${this.config.language}`);
				return "back";
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
		jdkVersions.push({ label: "$(edit) Custom JDK Version", description: "Enter a custom JDK version", detail: "For advanced users", value: "custom" });
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
				version: f.version, // ← NEW
				healthCheckPath: f.healthCheckPath,
			}));
			const framework = await this.showQuickPickWithBack("Select Java Framework", frameworks);
			if (framework === "back") return "back";
			if (framework === "cancel") return "cancel";
			if (framework) {
				this.config.framework = framework.value;
				this.config.healthCheckPath = framework.healthCheckPath;
				// ✅ NEW: خوندن نسخه
				this.config.frameworkVersion = framework.version;
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
			const lockFiles = [
				{ file: "pnpm-lock.yaml", pm: "pnpm" },
				{ file: "yarn.lock", pm: "yarn" },
				{ file: "bun.lockb", pm: "bun" },
				{ file: "deno.json", pm: "deno" },
				{ file: "package-lock.json", pm: "npm" },
			];
			let detected = false;
			for (const lockFile of lockFiles) {
				if (await fileExists(path.join(rootPath, lockFile.file))) {
					this.config.packageManager = lockFile.pm as any;
					detected = true;
					break;
				}
			}
			if (!detected) {
				this.config.packageManager = "npm";
			}
		}

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
			if (frameworkPick?.value) {
				this.config.framework = frameworkPick.value;

				if (frameworkPick.value === "nextjs") {
					vscode.window.showInformationMessage("⚠️ For Next.js, please add 'output: \"standalone\"' to your next.config.js for optimal Docker builds.");
				}
			}
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

	private async askCICDAndMonitoring(): Promise<"next" | "back" | "cancel"> {
		const options: any[] = [
			{
				label: "$(github) GitHub Actions",
				description: "CI/CD Pipeline",
				detail: "Generate .github/workflows/docker-build.yml",
				picked: true,
			},
			{
				label: "$(gitlab) GitLab CI/CD",
				description: "CI/CD Pipeline",
				detail: "Generate .gitlab-ci.yml",
				picked: true,
			},
			{
				label: "$(pulse) Prometheus",
				description: "Monitoring",
				detail: "Generate prometheus.yml",
				picked: this.config.enableHealthCheck,
			},
		];

		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${this.currentStep + 1}/${this.totalSteps}: CI/CD & Monitoring`;
		quickPick.placeholder = "Select which files to generate (multi-select) - Press Enter when done";
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

		return new Promise((resolve) => {
			const cleanup = () => {
				disposables.forEach((d) => d.dispose());
				quickPick.dispose();
			};

			disposables.push(
				quickPick.onDidAccept(() => {
					if (!isResolved) {
						isResolved = true;
						const selected = quickPick.selectedItems;
						this.setCICDAndMonitoringSelections(selected);
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
							const selected = quickPick.selectedItems;
							this.setCICDAndMonitoringSelections(selected);
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

	private setCICDAndMonitoringSelections(selected: readonly vscode.QuickPickItem[]): void {
		const selectedLabels = selected.map((o) => o.label);

		// ذخیره انتخاب‌ها در wizardState برای استفاده در
		const ciCdConfig = {
			generateGitHubActions: selectedLabels.some((l) => l.includes("GitHub Actions")),
			generateGitLabCI: selectedLabels.some((l) => l.includes("GitLab CI/CD")),
			generatePrometheus: selectedLabels.some((l) => l.includes("Prometheus")),
		};

		this.wizardState.set("ci_cd_config", ciCdConfig);
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
						// باگ 633: ذخیره state قبل از بستن
						this.saveState();
						cleanup();
						resolve("cancel");
					}
				}),
			);
			quickPick.show();
		});
	}

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

		// باگ 699: بررسی دسترسی نوشتن
		try {
			const testFile = path.join(workspaceFolder.uri.fsPath, ".dockeryzen-test");
			await fs.writeFile(testFile, "test");
			await fs.remove(testFile);
		} catch {
			throw new Error("Workspace is read-only. Cannot generate files.");
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

		if (this.config.language === "laravel" && this.config.enableNginx) {
			filesToWrite.push({ name: "nginx.conf", content: nginxConfigGenerator.generate() });
		}

		// NEW: خواندن تنظیمات CI/CD از wizardState
		const ciCdConfig = this.wizardState.get("ci_cd_config") || {
			generateGitHubActions: true,
			generateGitLabCI: true,
			generatePrometheus: this.config.enableHealthCheck,
		};

		// Prometheus فقط اگر کاربر انتخاب کرده
		if (ciCdConfig.generatePrometheus) {
			filesToWrite.push({ name: "prometheus.yml", content: prometheusConfigGenerator.generate() });
		}

		if (this.config.enableDebug) {
			filesToWrite.push({ name: "docker-compose.override.yml", content: dockerComposeOverrideGenerator.generate() });
		}

		// GitHub Actions فقط اگر کاربر انتخاب کرده
		if (ciCdConfig.generateGitHubActions) {
			filesToWrite.push({
				name: path.join(".github", "workflows", "docker-build.yml"),
				content: githubWorkflowGenerator.generate(),
			});
		}

		// GitLab CI فقط اگر کاربر انتخاب کرده
		if (ciCdConfig.generateGitLabCI) {
			filesToWrite.push({ name: ".gitlab-ci.yml", content: gitlabCIGenerator.generate() });
		}

		const writtenFiles: string[] = [];
		try {
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
			// باگ 509: cleanup فایل‌های ناقص
			for (const file of writtenFiles) {
				const filePath = path.join(workspacePath, file);
				if (await fileExists(filePath)) {
					await fs.remove(filePath);
				}
			}
			const message = error instanceof Error ? error.message : "Unknown error";
			vscode.window.showErrorMessage(`Failed to generate Docker files: ${message}`);
			throw error;
		}
	}
}
