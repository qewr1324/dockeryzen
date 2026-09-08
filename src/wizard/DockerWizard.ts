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

		await this.askProjectName();
		await this.askLanguage();
		await this.askPort();
		await this.askGeneralOptions();
		await this.askLanguageSpecificSettings();
		await this.askDatabases();
		await this.askMessageQueues();
		await this.askServices();
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
			{ label: "$(coffee) Java (JAR)", description: "Spring Boot, Quarkus, Micronaut", value: "java-jar" },
			{ label: "$(coffee) Java (WAR)", description: "Tomcat, Jetty", value: "java-war" },
			{ label: "$(symbol-class) C# .NET", description: ".NET Core/Framework", value: "dotnet" },
			{ label: "$(globe) PHP Laravel", description: "Laravel Framework", value: "laravel" },
			{ label: "$(browser) JavaScript Frontend", description: "Next.js, Angular, Nuxt.js", value: "js-frontend" },
			{ label: "$(server) JavaScript Backend", description: "Node.js, Express", value: "js-backend" },
			{ label: "$(ruby) Ruby on Rails", description: "Rails Framework", value: "rails" },
			{ label: "$(terminal) Python", description: "Django, Flask, FastAPI", value: "python" },
			{ label: "$(gear) Rust", description: "Actix, Rocket", value: "rust" },
			{ label: "$(rocket) Go", description: "Golang Application", value: "go" },
		];

		const selected = await vscode.window.showQuickPick(languages, {
			placeHolder: "Select your project language/framework",
			matchOnDescription: true,
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
			{ label: "$(package) Use Alpine", description: "Smaller image size (where available)", picked: false },
			{ label: "$(bug) Enable Debug", description: "Debug on port 5005", picked: false },
			{ label: "$(pulse) Enable Health Check", description: "Health check endpoint", picked: false },
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
			case "java-war":
				await this.askJavaSettings();
				break;
			case "js-frontend":
			case "js-backend":
				await this.askNodeSettings();
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

	private async askJavaSettings(): Promise<void> {
		// Build tool
		const buildTools = [
			{ label: "$(tools) Maven", value: "maven" },
			{ label: "$(tools) Gradle", value: "gradle" },
		];

		const buildTool = await vscode.window.showQuickPick(buildTools, {
			placeHolder: "Select build tool",
		});

		if (buildTool) {
			this.config.buildTool = buildTool.value as "maven" | "gradle";
		}

		// JDK Version
		const jdkVersions = ["8", "11", "17", "21", "25"].map((v) => ({ label: `JDK ${v}`, value: v }));

		const jdkVersion = await vscode.window.showQuickPick(jdkVersions, {
			placeHolder: "Select JDK version",
		});

		if (jdkVersion) {
			this.config.jdkVersion = jdkVersion.value;
		}

		// JDK Vendor
		const jdkVendors = [
			{ label: "Eclipse Temurin", value: "eclipse-temurin" },
			{ label: "Amazon Corretto", value: "amazoncorretto" },
			{ label: "OpenJDK", value: "openjdk" },
			{ label: "Oracle JDK", value: "oracle-jdk" },
		];

		const jdkVendor = await vscode.window.showQuickPick(jdkVendors, {
			placeHolder: "Select JDK vendor",
		});

		if (jdkVendor) {
			this.config.jdkVendor = jdkVendor.value;
		}

		// Framework or Server
		if (this.config.language === "java-jar") {
			const frameworks = [
				{ label: "Spring Boot", value: "spring-boot" },
				{ label: "Quarkus", value: "quarkus" },
				{ label: "Micronaut", value: "micronaut" },
			];

			const framework = await vscode.window.showQuickPick(frameworks, {
				placeHolder: "Select Java framework",
			});

			if (framework) {
				this.config.framework = framework.value;
			}
		} else {
			const servers = [
				{ label: "Tomcat", value: "tomcat" },
				{ label: "Jetty", value: "jetty" },
			];

			const server = await vscode.window.showQuickPick(servers, {
				placeHolder: "Select application server",
			});

			if (server) {
				this.config.server = server.value;
			}
		}
	}

	private async askNodeSettings(): Promise<void> {
		const nodeVersions = ["18", "20", "22"].map((v) => ({ label: `Node.js ${v}`, value: v }));

		const nodeVersion = await vscode.window.showQuickPick(nodeVersions, {
			placeHolder: "Select Node.js version",
		});

		if (nodeVersion) {
			this.config.nodeVersion = nodeVersion.value;
		}

		if (this.config.language === "js-frontend") {
			const frameworks = [
				{ label: "Next.js", value: "nextjs" },
				{ label: "Angular", value: "angular" },
				{ label: "Nuxt.js", value: "nuxtjs" },
			];

			const framework = await vscode.window.showQuickPick(frameworks, {
				placeHolder: "Select JavaScript framework",
			});

			if (framework) {
				this.config.framework = framework.value;
			}
		}
	}

	private async askPythonSettings(): Promise<void> {
		const frameworks = [
			{ label: "Django", value: "django" },
			{ label: "Flask", value: "flask" },
			{ label: "FastAPI", value: "fastapi" },
		];

		const framework = await vscode.window.showQuickPick(frameworks, {
			placeHolder: "Select Python framework",
		});

		if (framework) {
			this.config.framework = framework.value;
		}

		const pythonVersions = ["3.9", "3.10", "3.11", "3.12"].map((v) => ({ label: `Python ${v}`, value: v }));

		const pythonVersion = await vscode.window.showQuickPick(pythonVersions, {
			placeHolder: "Select Python version",
		});

		if (pythonVersion) {
			this.config.pythonVersion = pythonVersion.value;
		}
	}

	private async askDotNetSettings(): Promise<void> {
		const versions = ["6.0", "7.0", "8.0"].map((v) => ({ label: `.NET ${v}`, value: v }));

		const version = await vscode.window.showQuickPick(versions, {
			placeHolder: "Select .NET version",
		});

		if (version) {
			this.config.framework = version.value;
		}
	}

	private async askGoSettings(): Promise<void> {
		const versions = ["1.20", "1.21", "1.22"].map((v) => ({ label: `Go ${v}`, value: v }));

		const version = await vscode.window.showQuickPick(versions, {
			placeHolder: "Select Go version",
		});

		if (version) {
			this.config.framework = version.value;
		}
	}

	private async askRustSettings(): Promise<void> {
		const versions = ["1.74", "1.75", "1.76"].map((v) => ({ label: `Rust ${v}`, value: v }));

		const version = await vscode.window.showQuickPick(versions, {
			placeHolder: "Select Rust version",
		});

		if (version) {
			this.config.framework = version.value;
		}
	}

	private async askLaravelSettings(): Promise<void> {
		const versions = ["8.1", "8.2", "8.3"].map((v) => ({ label: `PHP ${v}`, value: v }));

		const version = await vscode.window.showQuickPick(versions, {
			placeHolder: "Select PHP version",
		});

		if (version) {
			this.config.framework = version.value;
		}
	}

	private async askRailsSettings(): Promise<void> {
		const versions = ["3.2", "3.3"].map((v) => ({ label: `Ruby ${v}`, value: v }));

		const version = await vscode.window.showQuickPick(versions, {
			placeHolder: "Select Ruby version",
		});

		if (version) {
			this.config.framework = version.value;
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
