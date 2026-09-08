import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import { ProjectConfig, DatabaseConfig, MessageQueueConfig, ServiceConfig } from "../types/index.js";
import { DatabaseManager } from "../managers/DatabaseManager.js";
import { MessageQueueManager } from "../managers/MessageQueueManager.js";
import { ServiceManager } from "../managers/ServiceManager.js";
import { DockerfileGenerator } from "../generators/DockerfileGenerator.js";
import { DockerComposeGenerator } from "../generators/DockerComposeGenerator.js";
import { DockerignoreGenerator } from "../generators/DockerignoreGenerator.js";

export class DockerWizard {
	private config: ProjectConfig;

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

		// Step 1: Project name
		await this.askProjectName();

		// Step 2: Language
		await this.askLanguage();

		// Step 3: Port
		await this.askPort();

		// Step 4: General options
		await this.askGeneralOptions();

		// Step 5: Language-specific settings
		await this.askLanguageSpecificSettings();

		// Step 6: Databases
		await this.askDatabases();

		// Step 7: Message queues
		await this.askMessageQueues();

		// Step 8: Additional services
		await this.askServices();

		// Generate files
		await this.generateFiles();
	}

	private async askProjectName(): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const defaultName = workspaceFolder ? path.basename(workspaceFolder.uri.fsPath) : "my-project";

		const projectName = await vscode.window.showInputBox({
			prompt: "Enter project name",
			value: defaultName,
			validateInput: (value) => {
				if (!value || value.length === 0) {
					return "Project name cannot be empty";
				}
				if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
					return "Project name can only contain letters, numbers, hyphens, and underscores";
				}
				if (value.length > 50) {
					return "Project name must be less than 50 characters";
				}
				return null;
			},
		});

		if (!projectName) {
			throw new Error("Project name is required");
		}
		this.config.projectName = projectName;
	}

	private async askLanguage(): Promise<void> {
		const languages = [
			{
				label: "$(coffee) Java (JAR)",
				description: "Spring Boot, Quarkus, Micronaut",
				detail: "Java application packaged as JAR",
				value: "java-jar",
			},
			{
				label: "$(coffee) Java (WAR)",
				description: "Tomcat, Jetty",
				detail: "Java web application packaged as WAR",
				value: "java-war",
			},
			{
				label: "$(symbol-class) C# .NET",
				description: ".NET Core/Framework",
				detail: ".NET application",
				value: "dotnet",
			},
			{
				label: "$(globe) PHP Laravel",
				description: "Laravel Framework",
				detail: "PHP Laravel application",
				value: "laravel",
			},
			{
				label: "$(browser) JavaScript Frontend",
				description: "Next.js, Angular, Nuxt.js",
				detail: "Frontend JavaScript application",
				value: "js-frontend",
			},
			{
				label: "$(server) JavaScript Backend",
				description: "Node.js, Express",
				detail: "Backend JavaScript application",
				value: "js-backend",
			},
			{
				label: "$(ruby) Ruby on Rails",
				description: "Rails Framework",
				detail: "Ruby on Rails application",
				value: "rails",
			},
			{
				label: "$(terminal) Python",
				description: "Django, Flask, FastAPI",
				detail: "Python application",
				value: "python",
			},
			{
				label: "$(gear) Rust",
				description: "Actix, Rocket",
				detail: "Rust application",
				value: "rust",
			},
			{
				label: "$(symbol-method) C++",
				description: "C++ Application",
				detail: "C++ application",
				value: "cpp",
			},
			{
				label: "$(symbol-constant) C",
				description: "C Application",
				detail: "C application",
				value: "c",
			},
			{
				label: "$(rocket) Go",
				description: "Golang Application",
				detail: "Go application",
				value: "go",
			},
		];

		const selected = await vscode.window.showQuickPick(languages, {
			placeHolder: "Select your project language/framework",
			matchOnDescription: true,
			matchOnDetail: true,
		});

		if (!selected) {
			throw new Error("Language selection is required");
		}
		this.config.language = selected.value;
	}

	private async askPort(): Promise<void> {
		const port = await vscode.window.showInputBox({
			prompt: "Enter application port",
			value: "8080",
			validateInput: (value) => {
				const portNum = parseInt(value);
				if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
					return "Please enter a valid port number (1-65535)";
				}
				return null;
			},
		});

		if (!port) {
			throw new Error("Port is required");
		}
		this.config.port = parseInt(port);
	}

	private async askGeneralOptions(): Promise<void> {
		const options = [
			{
				label: "$(package) Use Alpine",
				description: "Use Alpine-based images for smaller size",
				picked: false,
			},
			{
				label: "$(bug) Enable Debug",
				description: "Enable debug mode (port 5005)",
				picked: false,
			},
			{
				label: "$(pulse) Enable Health Check",
				description: "Add health check to /actuator/health",
				picked: false,
			},
		];

		const selected = await vscode.window.showQuickPick(options, {
			placeHolder: "Select general options (multi-select)",
			canPickMany: true,
			matchOnDescription: true,
		});

		this.config.useAlpine = selected?.some((o) => o.label.includes("Alpine")) || false;
		this.config.enableDebug = selected?.some((o) => o.label.includes("Debug")) || false;
		this.config.enableHealthCheck = selected?.some((o) => o.label.includes("Health")) || false;
	}

	private async askLanguageSpecificSettings(): Promise<void> {
		switch (this.config.language) {
			case "java-jar":
				await this.askJavaSettings();
				break;
			case "java-war":
				await this.askJavaSettings(true);
				break;
			case "js-frontend":
				await this.askJSFrontendSettings();
				break;
			case "js-backend":
				await this.askJSBackendSettings();
				break;
			case "python":
				await this.askPythonSettings();
				break;
			case "dotnet":
				await this.askDotNetSettings();
				break;
			case "go":
				await this.askGoSettings();
				break;
			case "rust":
				await this.askRustSettings();
				break;
			case "laravel":
				await this.askLaravelSettings();
				break;
			case "rails":
				await this.askRailsSettings();
				break;
		}
	}

	private async askJavaSettings(isWar = false): Promise<void> {
		// Build tool
		const buildTools = [
			{ label: "$(tools) Maven", description: "Use Maven build tool", value: "maven" },
			{ label: "$(tools) Gradle", description: "Use Gradle build tool", value: "gradle" },
		];

		const buildTool = await vscode.window.showQuickPick(buildTools, {
			placeHolder: "Select build tool",
			matchOnDescription: true,
		});

		if (buildTool) {
			this.config.buildTool = buildTool.value as "maven" | "gradle";
		}

		// JDK Version
		const jdkVersions = ["8", "11", "17", "21", "25"].map((v) => ({
			label: `$(tag) JDK ${v}`,
			description: `Java Development Kit ${v}`,
			value: v,
		}));

		const jdkVersion = await vscode.window.showQuickPick(jdkVersions, {
			placeHolder: "Select JDK version",
			matchOnDescription: true,
		});

		if (jdkVersion) {
			this.config.jdkVersion = jdkVersion.value;
		}

		// JDK Vendor
		const jdkVendors = [
			{ label: "$(shield) Eclipse Temurin", description: "Recommended - Free and open source", value: "eclipse-temurin" },
			{ label: "$(shield) Amazon Corretto", description: "Amazon's free distribution", value: "amazoncorretto" },
			{ label: "$(shield) OpenJDK", description: "Official open-source JDK", value: "openjdk" },
			{ label: "$(shield) Oracle JDK", description: "Oracle's commercial JDK", value: "oracle-jdk" },
		];

		const jdkVendor = await vscode.window.showQuickPick(jdkVendors, {
			placeHolder: "Select JDK vendor",
			matchOnDescription: true,
		});

		if (jdkVendor) {
			this.config.jdkVendor = jdkVendor.value;
		}

		if (!isWar) {
			// Java framework
			const frameworks = [
				{ label: "$(rocket) Spring Boot", description: "Most popular Java framework", value: "spring-boot" },
				{ label: "$(rocket) Quarkus", description: "Kubernetes-native Java framework", value: "quarkus" },
				{ label: "$(rocket) Micronaut", description: "Lightweight Java framework", value: "micronaut" },
			];

			const framework = await vscode.window.showQuickPick(frameworks, {
				placeHolder: "Select Java framework",
				matchOnDescription: true,
			});

			if (framework) {
				this.config.framework = framework.value;
			}
		} else {
			// WAR server
			const servers = [
				{ label: "$(server) Tomcat", description: "Apache Tomcat", value: "tomcat" },
				{ label: "$(server) Jetty", description: "Eclipse Jetty", value: "jetty" },
			];

			const server = await vscode.window.showQuickPick(servers, {
				placeHolder: "Select application server",
				matchOnDescription: true,
			});

			if (server) {
				this.config.server = server.value;
			}
		}
	}

	private async askJSFrontendSettings(): Promise<void> {
		const frameworks = [
			{ label: "$(browser) Next.js", description: "React framework", value: "nextjs" },
			{ label: "$(browser) Angular", description: "Google's framework", value: "angular" },
			{ label: "$(browser) Nuxt.js", description: "Vue.js framework", value: "nuxtjs" },
		];

		const framework = await vscode.window.showQuickPick(frameworks, {
			placeHolder: "Select JavaScript framework",
			matchOnDescription: true,
		});

		if (framework) {
			this.config.framework = framework.value;
		}

		// Node version
		const nodeVersions = ["18", "20", "22"].map((v) => ({
			label: `$(tag) Node.js ${v}`,
			description: `Node.js version ${v}`,
			value: v,
		}));

		const nodeVersion = await vscode.window.showQuickPick(nodeVersions, {
			placeHolder: "Select Node.js version",
			matchOnDescription: true,
		});

		if (nodeVersion) {
			this.config.nodeVersion = nodeVersion.value;
		}
	}

	private async askJSBackendSettings(): Promise<void> {
		const frameworks = [
			{ label: "$(server) Express", description: "Minimal Node.js framework", value: "express" },
			{ label: "$(server) NestJS", description: "Progressive Node.js framework", value: "nestjs" },
			{ label: "$(server) Fastify", description: "Fast Node.js framework", value: "fastify" },
		];

		const framework = await vscode.window.showQuickPick(frameworks, {
			placeHolder: "Select Node.js framework",
			matchOnDescription: true,
		});

		if (framework) {
			this.config.framework = framework.value;
		}

		// Node version
		const nodeVersions = ["18", "20", "22"].map((v) => ({
			label: `$(tag) Node.js ${v}`,
			description: `Node.js version ${v}`,
			value: v,
		}));

		const nodeVersion = await vscode.window.showQuickPick(nodeVersions, {
			placeHolder: "Select Node.js version",
			matchOnDescription: true,
		});

		if (nodeVersion) {
			this.config.nodeVersion = nodeVersion.value;
		}
	}

	private async askPythonSettings(): Promise<void> {
		const frameworks = [
			{ label: "$(terminal) Django", description: "Full-featured web framework", value: "django" },
			{ label: "$(terminal) Flask", description: "Lightweight web framework", value: "flask" },
			{ label: "$(terminal) FastAPI", description: "Modern fast API framework", value: "fastapi" },
		];

		const framework = await vscode.window.showQuickPick(frameworks, {
			placeHolder: "Select Python framework",
			matchOnDescription: true,
		});

		if (framework) {
			this.config.framework = framework.value;
		}

		const pythonVersions = ["3.9", "3.10", "3.11", "3.12"].map((v) => ({
			label: `$(tag) Python ${v}`,
			description: `Python version ${v}`,
			value: v,
		}));

		const pythonVersion = await vscode.window.showQuickPick(pythonVersions, {
			placeHolder: "Select Python version",
			matchOnDescription: true,
		});

		if (pythonVersion) {
			this.config.pythonVersion = pythonVersion.value;
		}
	}

	private async askDotNetSettings(): Promise<void> {
		const dotnetVersions = ["6.0", "7.0", "8.0"].map((v) => ({
			label: `$(tag) .NET ${v}`,
			description: `.NET version ${v}`,
			value: v,
		}));

		const dotnetVersion = await vscode.window.showQuickPick(dotnetVersions, {
			placeHolder: "Select .NET version",
			matchOnDescription: true,
		});

		if (dotnetVersion) {
			this.config.framework = dotnetVersion.value;
		}
	}

	private async askGoSettings(): Promise<void> {
		const goVersions = ["1.20", "1.21", "1.22"].map((v) => ({
			label: `$(tag) Go ${v}`,
			description: `Go version ${v}`,
			value: v,
		}));

		const goVersion = await vscode.window.showQuickPick(goVersions, {
			placeHolder: "Select Go version",
			matchOnDescription: true,
		});

		if (goVersion) {
			this.config.framework = goVersion.value;
		}
	}

	private async askRustSettings(): Promise<void> {
		const rustVersions = ["1.74", "1.75", "1.76"].map((v) => ({
			label: `$(tag) Rust ${v}`,
			description: `Rust version ${v}`,
			value: v,
		}));

		const rustVersion = await vscode.window.showQuickPick(rustVersions, {
			placeHolder: "Select Rust version",
			matchOnDescription: true,
		});

		if (rustVersion) {
			this.config.framework = rustVersion.value;
		}
	}

	private async askLaravelSettings(): Promise<void> {
		const phpVersions = ["8.1", "8.2", "8.3"].map((v) => ({
			label: `$(tag) PHP ${v}`,
			description: `PHP version ${v}`,
			value: v,
		}));

		const phpVersion = await vscode.window.showQuickPick(phpVersions, {
			placeHolder: "Select PHP version",
			matchOnDescription: true,
		});

		if (phpVersion) {
			this.config.framework = phpVersion.value;
		}
	}

	private async askRailsSettings(): Promise<void> {
		const rubyVersions = ["3.2", "3.3"].map((v) => ({
			label: `$(tag) Ruby ${v}`,
			description: `Ruby version ${v}`,
			value: v,
		}));

		const rubyVersion = await vscode.window.showQuickPick(rubyVersions, {
			placeHolder: "Select Ruby version",
			matchOnDescription: true,
		});

		if (rubyVersion) {
			this.config.framework = rubyVersion.value;
		}
	}

	private async askDatabases(): Promise<void> {
		const databaseManager = new DatabaseManager();
		this.config.databases = await databaseManager.selectDatabases();
	}

	private async askMessageQueues(): Promise<void> {
		const messageQueueManager = new MessageQueueManager();
		this.config.messageQueues = await messageQueueManager.selectMessageQueues();
	}

	private async askServices(): Promise<void> {
		const serviceManager = new ServiceManager();
		this.config.services = await serviceManager.selectServices();
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
			// Generate Dockerfile
			const dockerfile = dockerfileGenerator.generate();
			await fs.writeFile(path.join(workspaceFolder.uri.fsPath, "Dockerfile"), dockerfile);

			// Generate docker-compose.yml
			const dockerCompose = dockerComposeGenerator.generate();
			await fs.writeFile(path.join(workspaceFolder.uri.fsPath, "docker-compose.yml"), dockerCompose);

			// Generate .dockerignore
			const dockerignore = dockerignoreGenerator.generate();
			await fs.writeFile(path.join(workspaceFolder.uri.fsPath, ".dockerignore"), dockerignore);

			// Show success message
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
