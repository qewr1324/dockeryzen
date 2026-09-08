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

export class DockerWizard {
	private config: ProjectConfig;
	private currentStep: number = 0;
	private totalSteps: number = 8;

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
			inputBox.onDidAccept(() => {
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
			});

			inputBox.onDidTriggerButton((button) => {
				if (!isResolved) {
					if (button.tooltip === "Back") {
						isResolved = true;
						inputBox.dispose();
						resolve("back");
					} else if (button.tooltip === "OK") {
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
		const languages = [
			{
				label: "$(coffee) Java (JAR)",
				description: "Spring Boot, Quarkus, Micronaut",
				detail: "Java application packaged as JAR | Best for: Microservices, REST APIs",
				value: "java-jar",
			},
			{
				label: "$(coffee) Java (WAR)",
				description: "Tomcat, Jetty",
				detail: "Java web application packaged as WAR | Best for: Traditional web apps",
				value: "java-war",
			},
			{
				label: "$(symbol-class) C# .NET",
				description: ".NET Core/Framework",
				detail: ".NET application | Best for: Windows/Linux services, Web APIs",
				value: "dotnet",
			},
			{
				label: "$(globe) PHP Laravel",
				description: "Laravel Framework",
				detail: "PHP Laravel application | Best for: Rapid web development",
				value: "laravel",
			},
			{
				label: "$(browser) JavaScript Frontend",
				description: "Next.js, Angular, Nuxt.js",
				detail: "Frontend JavaScript application | Best for: SPAs, SSR apps",
				value: "js-frontend",
			},
			{
				label: "$(server) JavaScript Backend",
				description: "Node.js, Express",
				detail: "Backend JavaScript application | Best for: APIs, real-time apps",
				value: "js-backend",
			},
			{
				label: "$(ruby) Ruby on Rails",
				description: "Rails Framework",
				detail: "Ruby on Rails application | Best for: Rapid prototyping, MVPs",
				value: "rails",
			},
			{
				label: "$(terminal) Python",
				description: "Django, Flask, FastAPI",
				detail: "Python application | Best for: AI/ML, data processing, APIs",
				value: "python",
			},
			{
				label: "$(gear) Rust",
				description: "Actix, Rocket",
				detail: "Rust application | Best for: High performance, system programming",
				value: "rust",
			},
			{
				label: "$(rocket) Go",
				description: "Golang Application",
				detail: "Go application | Best for: Cloud-native, microservices, CLI tools",
				value: "go",
			},
		];

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
		switch (this.config.language) {
			case "java-jar":
			case "java-war":
				return await this.askJavaSettings();
			case "js-frontend":
			case "js-backend":
				return await this.askNodeSettings();
			case "python":
				return await this.askPythonSettings();
			case "dotnet":
				return await this.askDotNetSettings();
			case "go":
				return await this.askGoSettings();
			case "rust":
				return await this.askRustSettings();
			case "laravel":
				return await this.askLaravelSettings();
			case "rails":
				return await this.askRailsSettings();
			default:
				return "next";
		}
	}

	private async askJavaSettings(): Promise<"next" | "back" | "cancel"> {
		// Build tool
		const buildTools = [
			{
				label: "$(tools) Maven",
				description: "Apache Maven",
				detail: "Most popular Java build tool | Uses pom.xml | Best for: Traditional Java projects",
				value: "maven",
			},
			{
				label: "$(tools) Gradle",
				description: "Gradle Build Tool",
				detail: "Modern build tool | Uses build.gradle | Best for: Android, Kotlin, large projects",
				value: "gradle",
			},
		];

		const buildTool = await this.showQuickPickWithBack("Select Build Tool", buildTools);
		if (buildTool === "back") return "back";
		if (buildTool === "cancel") return "cancel";
		if (buildTool) this.config.buildTool = buildTool.value as "maven" | "gradle";

		// JDK Version
		const jdkVersions = [
			{ label: "$(tag) JDK 8", description: "Java 8 (LTS)", detail: "Legacy | Best for: Old enterprise applications", value: "8" },
			{ label: "$(tag) JDK 11", description: "Java 11 (LTS)", detail: "Long-term support | Best for: Production stability", value: "11" },
			{ label: "$(tag) JDK 17", description: "Java 17 (LTS)", detail: "Modern LTS | Best for: New projects (Recommended)", value: "17" },
			{ label: "$(tag) JDK 21", description: "Java 21 (LTS)", detail: "Latest LTS | Best for: Cutting-edge features", value: "21" },
			{ label: "$(tag) JDK 25", description: "Java 25", detail: "Latest release | Best for: Experimental features", value: "25" },
		];

		const jdkVersion = await this.showQuickPickWithBack("Select JDK Version", jdkVersions);
		if (jdkVersion === "back") return "back";
		if (jdkVersion === "cancel") return "cancel";
		if (jdkVersion) this.config.jdkVersion = jdkVersion.value;

		// JDK Vendor
		const jdkVendors = [
			{
				label: "$(shield) Eclipse Temurin",
				description: "Recommended - Free and open source",
				detail: "Most popular | Best for: Production use, community support",
				value: "eclipse-temurin",
			},
			{
				label: "$(shield) Amazon Corretto",
				description: "Amazon's free distribution",
				detail: "AWS optimized | Best for: AWS deployments",
				value: "amazoncorretto",
			},
			{
				label: "$(shield) OpenJDK",
				description: "Official open-source JDK",
				detail: "Reference implementation | Best for: Open source projects",
				value: "openjdk",
			},
			{
				label: "$(shield) Oracle JDK",
				description: "Oracle's commercial JDK",
				detail: "Commercial support | Best for: Enterprise with Oracle support",
				value: "oracle-jdk",
			},
		];

		const jdkVendor = await this.showQuickPickWithBack("Select JDK Vendor", jdkVendors);
		if (jdkVendor === "back") return "back";
		if (jdkVendor === "cancel") return "cancel";
		if (jdkVendor) this.config.jdkVendor = jdkVendor.value;

		// Framework or Server
		if (this.config.language === "java-jar") {
			const frameworks = [
				{
					label: "$(rocket) Spring Boot",
					description: "Most popular Java framework",
					detail: "Best for: Enterprise apps, Microservices, REST APIs",
					value: "spring-boot",
				},
				{
					label: "$(rocket) Quarkus",
					description: "Kubernetes-native Java framework",
					detail: "Best for: Cloud-native, Serverless, Fast startup",
					value: "quarkus",
				},
				{
					label: "$(rocket) Micronaut",
					description: "Lightweight Java framework",
					detail: "Best for: Microservices, Low memory footprint",
					value: "micronaut",
				},
			];

			const framework = await this.showQuickPickWithBack("Select Java Framework", frameworks);
			if (framework === "back") return "back";
			if (framework === "cancel") return "cancel";
			if (framework) this.config.framework = framework.value;
		} else {
			const servers = [
				{
					label: "$(server) Tomcat",
					description: "Apache Tomcat",
					detail: "Most popular | Best for: Traditional Java web apps",
					value: "tomcat",
				},
				{
					label: "$(server) Jetty",
					description: "Eclipse Jetty",
					detail: "Lightweight | Best for: Embedded servers, Microservices",
					value: "jetty",
				},
			];

			const server = await this.showQuickPickWithBack("Select Application Server", servers);
			if (server === "back") return "back";
			if (server === "cancel") return "cancel";
			if (server) this.config.server = server.value;
		}

		return "next";
	}

	private async askNodeSettings(): Promise<"next" | "back" | "cancel"> {
		const nodeVersions = [
			{ label: "$(tag) Node.js 18", description: "LTS", detail: "Long-term support | Best for: Production stability", value: "18" },
			{ label: "$(tag) Node.js 20", description: "LTS", detail: "Latest LTS | Best for: New projects (Recommended)", value: "20" },
			{ label: "$(tag) Node.js 22", description: "Current", detail: "Latest features | Best for: Experimental projects", value: "22" },
		];

		const nodeVersion = await this.showQuickPickWithBack("Select Node.js Version", nodeVersions);
		if (nodeVersion === "back") return "back";
		if (nodeVersion === "cancel") return "cancel";
		if (nodeVersion) this.config.nodeVersion = nodeVersion.value;

		if (this.config.language === "js-frontend") {
			const frameworks = [
				{
					label: "$(browser) Next.js",
					description: "React framework",
					detail: "Best for: SSR, Static sites, Full-stack React",
					value: "nextjs",
				},
				{
					label: "$(browser) Angular",
					description: "Google's framework",
					detail: "Best for: Enterprise SPAs, Large teams",
					value: "angular",
				},
				{
					label: "$(browser) Nuxt.js",
					description: "Vue.js framework",
					detail: "Best for: SSR, Static sites, Full-stack Vue",
					value: "nuxtjs",
				},
			];

			const framework = await this.showQuickPickWithBack("Select JavaScript Framework", frameworks);
			if (framework === "back") return "back";
			if (framework === "cancel") return "cancel";
			if (framework) this.config.framework = framework.value;
		} else {
			const frameworks = [
				{
					label: "$(server) Express",
					description: "Minimal Node.js framework",
					detail: "Best for: Simple APIs, Quick prototyping",
					value: "express",
				},
				{
					label: "$(server) NestJS",
					description: "Progressive Node.js framework",
					detail: "Best for: Enterprise apps, TypeScript projects",
					value: "nestjs",
				},
				{
					label: "$(server) Fastify",
					description: "Fast Node.js framework",
					detail: "Best for: High performance APIs",
					value: "fastify",
				},
			];

			const framework = await this.showQuickPickWithBack("Select Node.js Framework", frameworks);
			if (framework === "back") return "back";
			if (framework === "cancel") return "cancel";
			if (framework) this.config.framework = framework.value;
		}

		return "next";
	}

	private async askPythonSettings(): Promise<"next" | "back" | "cancel"> {
		const frameworks = [
			{
				label: "$(terminal) Django",
				description: "Full-featured web framework",
				detail: "Best for: Large web apps, Admin interfaces, ORM",
				value: "django",
			},
			{
				label: "$(terminal) Flask",
				description: "Lightweight web framework",
				detail: "Best for: Simple APIs, Microservices, Prototyping",
				value: "flask",
			},
			{
				label: "$(terminal) FastAPI",
				description: "Modern fast API framework",
				detail: "Best for: High-performance APIs, Auto documentation",
				value: "fastapi",
			},
		];

		const framework = await this.showQuickPickWithBack("Select Python Framework", frameworks);
		if (framework === "back") return "back";
		if (framework === "cancel") return "cancel";
		if (framework) this.config.framework = framework.value;

		const pythonVersions = [
			{ label: "$(tag) Python 3.9", description: "Legacy", detail: "Older version | Best for: Legacy projects", value: "3.9" },
			{ label: "$(tag) Python 3.10", description: "Stable", detail: "Stable release | Best for: Production stability", value: "3.10" },
			{ label: "$(tag) Python 3.11", description: "Recommended", detail: "Faster performance | Best for: New projects", value: "3.11" },
			{ label: "$(tag) Python 3.12", description: "Latest", detail: "Latest features | Best for: Experimental projects", value: "3.12" },
		];

		const pythonVersion = await this.showQuickPickWithBack("Select Python Version", pythonVersions);
		if (pythonVersion === "back") return "back";
		if (pythonVersion === "cancel") return "cancel";
		if (pythonVersion) this.config.pythonVersion = pythonVersion.value;

		return "next";
	}

	private async askDotNetSettings(): Promise<"next" | "back" | "cancel"> {
		const versions = [
			{ label: "$(tag) .NET 6.0", description: "LTS", detail: "Long-term support | Best for: Production stability", value: "6.0" },
			{ label: "$(tag) .NET 7.0", description: "STS", detail: "Standard-term support | Best for: New features", value: "7.0" },
			{ label: "$(tag) .NET 8.0", description: "LTS", detail: "Latest LTS | Best for: New projects (Recommended)", value: "8.0" },
		];

		const version = await this.showQuickPickWithBack("Select .NET Version", versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version) this.config.framework = version.value;

		return "next";
	}

	private async askGoSettings(): Promise<"next" | "back" | "cancel"> {
		const versions = [
			{ label: "$(tag) Go 1.20", description: "Stable", detail: "Stable release | Best for: Production stability", value: "1.20" },
			{ label: "$(tag) Go 1.21", description: "Recommended", detail: "Latest stable | Best for: New projects", value: "1.21" },
			{ label: "$(tag) Go 1.22", description: "Latest", detail: "Latest features | Best for: Experimental projects", value: "1.22" },
		];

		const version = await this.showQuickPickWithBack("Select Go Version", versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version) this.config.framework = version.value;

		return "next";
	}

	private async askRustSettings(): Promise<"next" | "back" | "cancel"> {
		const versions = [
			{ label: "$(tag) Rust 1.74", description: "Stable", detail: "Stable release | Best for: Production stability", value: "1.74" },
			{ label: "$(tag) Rust 1.75", description: "Recommended", detail: "Latest stable | Best for: New projects", value: "1.75" },
			{ label: "$(tag) Rust 1.76", description: "Latest", detail: "Latest features | Best for: Experimental projects", value: "1.76" },
		];

		const version = await this.showQuickPickWithBack("Select Rust Version", versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version) this.config.framework = version.value;

		return "next";
	}

	private async askLaravelSettings(): Promise<"next" | "back" | "cancel"> {
		const versions = [
			{ label: "$(tag) PHP 8.1", description: "Stable", detail: "Stable release | Best for: Production stability", value: "8.1" },
			{ label: "$(tag) PHP 8.2", description: "Recommended", detail: "Latest stable | Best for: New projects", value: "8.2" },
			{ label: "$(tag) PHP 8.3", description: "Latest", detail: "Latest features | Best for: Experimental projects", value: "8.3" },
		];

		const version = await this.showQuickPickWithBack("Select PHP Version", versions);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (version) this.config.framework = version.value;

		return "next";
	}

	private async askRailsSettings(): Promise<"next" | "back" | "cancel"> {
		const versions = [
			{ label: "$(tag) Ruby 3.2", description: "Stable", detail: "Stable release | Best for: Production stability", value: "3.2" },
			{ label: "$(tag) Ruby 3.3", description: "Latest", detail: "Latest features | Best for: New projects", value: "3.3" },
		];

		const version = await this.showQuickPickWithBack("Select Ruby Version", versions);
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

		const dockerfileGenerator = new DockerfileGenerator(this.config);
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
