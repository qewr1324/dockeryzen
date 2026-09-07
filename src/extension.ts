import * as vscode from "vscode";
import { AnalyzeCommand } from "./core/commands/AnalyzeCommand.js";
import { GenerateCommand } from "./core/commands/GenerateCommand.js";
import { QuickGenerateCommand } from "./core/commands/QuickGenerateCommand.js";
import { AddDatabaseCommand } from "./core/commands/AddDatabaseCommand.js";
import { UpdateCommand } from "./core/commands/UpdateCommand.js";
import { ConfigManager } from "./core/config/ConfigManager.js";
import { ConfigLoader } from "./core/config/ConfigLoader.js";
import { SettingsPanel } from "./core/ui/SettingsPanel.js";
import { ProgressReporter } from "./core/ui/ProgressReporter.js";
import { DockerfileGenerator } from "./core/generator/DockerfileGenerator.js";
import { ComposeGenerator } from "./core/generator/ComposeGenerator.js";
import { IgnoreGenerator } from "./core/generator/IgnoreGenerator.js";
import { EnvGenerator } from "./core/generator/EnvGenerator.js";
import { DevContainerGenerator } from "./core/generator/DevContainerGenerator.js";
import { AnalyzerFactory } from "./core/analyzer/AnalyzerFactory.js";
import * as fs from "fs-extra";
import * as path from "path";
import type { DockerConfig, ProjectAnalysis, DatabaseConfig, MessageQueueConfig, AdditionalServiceConfig } from "./types/interfaces.js";
import { DatabaseType, OutputType } from "./types/interfaces.js";

export function activate(context: vscode.ExtensionContext): void {
	console.log("Dockeryzen extension is now active!");

	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

	const configManager = ConfigManager.getInstance();
	const outputChannel = vscode.window.createOutputChannel("Dockeryzen");

	const analyzeCommand = new AnalyzeCommand();
	const generateCommand = new GenerateCommand();
	const quickGenerateCommand = new QuickGenerateCommand();
	const addDatabaseCommand = new AddDatabaseCommand();
	const updateCommand = new UpdateCommand();
	const configLoader = new ConfigLoader();

	// Register all commands
	context.subscriptions.push(
		// Analyze project
		vscode.commands.registerCommand("dockeryzen.analyze", async () => {
			outputChannel.show();
			outputChannel.appendLine("Starting project analysis...");
			await analyzeCommand.execute();
			outputChannel.appendLine("Analysis completed.");
		}),

		// Generate with wizard
		vscode.commands.registerCommand("dockeryzen.generate", async () => {
			outputChannel.show();
			outputChannel.appendLine("Starting Docker file generation...");
			await generateCommand.execute();
			outputChannel.appendLine("Generation completed.");
		}),

		// Generate all (auto)
		vscode.commands.registerCommand("dockeryzen.generate-all", async () => {
			outputChannel.show();
			outputChannel.appendLine("Starting automatic generation...");
			await generateCommand.execute();
			outputChannel.appendLine("Automatic generation completed.");
		}),

		// Quick generate (defaults)
		vscode.commands.registerCommand("dockeryzen.quick-generate", async () => {
			outputChannel.show();
			outputChannel.appendLine("Starting quick generation...");
			await quickGenerateCommand.execute();
			outputChannel.appendLine("Quick generation completed.");
		}),

		// Update existing files
		vscode.commands.registerCommand("dockeryzen.update", async () => {
			outputChannel.show();
			outputChannel.appendLine("Updating existing Docker files...");
			await updateCommand.execute();
			outputChannel.appendLine("Update completed.");
		}),

		// Add database
		vscode.commands.registerCommand("dockeryzen.add-database", async () => {
			outputChannel.show();
			outputChannel.appendLine("Adding database service...");
			await addDatabaseCommand.execute();
			outputChannel.appendLine("Database added.");
		}),

		// Show logs
		vscode.commands.registerCommand("dockeryzen.show-logs", () => {
			outputChannel.show();
		}),

		// Health check
		vscode.commands.registerCommand("dockeryzen.health-check", async () => {
			outputChannel.show();
			outputChannel.appendLine("Checking container health...");
			vscode.window.showInformationMessage("Dockeryzen: Health check feature coming soon!");
		}),

		// Generate dev container
		vscode.commands.registerCommand("dockeryzen.generate-dev-container", async () => {
			outputChannel.show();
			outputChannel.appendLine("Generating dev container...");
			await generateDevContainer(workspaceFolder, outputChannel);
		}),

		// Open Settings UI
		vscode.commands.registerCommand("dockeryzen.openSettings", async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage("No workspace folder found.");
				return;
			}

			let config = await configLoader.load(workspaceFolder);

			if (!config) {
				// Create default config
				config = {
					version: "1.0.0",
					project: {
						name: workspaceFolder.name,
						type: "maven",
						framework: "none",
						jdkVersion: "17",
						jdkVendor: "eclipse-temurin",
						port: 8080,
						outputType: "jar",
					},
					docker: {
						baseImage: "eclipse-temurin",
						useAlpine: false,
						jvmOptions: "-Xmx512m -Xms256m",
						enableDebug: false,
						debugPort: 5005,
						enableHealthCheck: true,
						healthCheckEndpoint: "/actuator/health",
					},
					databases: [],
					messageQueues: [],
					services: [],
					envFile: true,
					profiles: [],
					ciCd: {
						github: false,
						gitlab: false,
					},
					kubernetes: {
						enabled: false,
						replicas: 3,
					},
					devContainer: {
						enabled: false,
					},
				};

				// Save default config
				const format = await vscode.window.showQuickPick(
					[
						{ label: "JSON", description: "dockeryzen.config.json" },
						{ label: "YAML", description: "dockeryzen.config.yaml" },
						{ label: "TOML", description: "dockeryzen.config.toml" },
					],
					{ placeHolder: "Select config format:" },
				);

				if (format) {
					const savedPath = await configLoader.save(workspaceFolder, config, format.label.toLowerCase() as "json" | "yaml" | "toml");
					vscode.window.showInformationMessage(`Config created: ${path.basename(savedPath)}`);
				}
			}

			SettingsPanel.show(config);
		}),

		// Generate from config file
		vscode.commands.registerCommand("dockeryzen.generateFromConfig", async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage("No workspace folder found.");
				return;
			}

			const config = await configLoader.load(workspaceFolder);

			if (!config) {
				const action = await vscode.window.showErrorMessage("No config file found. Create dockeryzen.config.json first.", "Open Settings", "Cancel");

				if (action === "Open Settings") {
					vscode.commands.executeCommand("dockeryzen.openSettings");
				}
				return;
			}

			await generateFromConfig(workspaceFolder, config, outputChannel);
		}),
	);

	// Register context menu for config files
	context.subscriptions.push(
		vscode.commands.registerCommand("dockeryzen.openConfigSettings", async (uri: vscode.Uri) => {
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
			if (!workspaceFolder) return;

			const config = await configLoader.load(workspaceFolder);
			if (config) {
				SettingsPanel.show(config);
			}
		}),
	);

	console.log("Dockeryzen extension activated successfully!");
}

/**
 * Generate dev container
 */
async function generateDevContainer(workspaceFolder: vscode.WorkspaceFolder | undefined, outputChannel: vscode.OutputChannel): Promise<void> {
	if (!workspaceFolder) {
		vscode.window.showErrorMessage("No workspace folder found.");
		return;
	}

	const progress = new ProgressReporter();

	await progress.run("Generating dev container...", async (reporter) => {
		reporter.report({ message: "Analyzing project...", increment: 30 });

		const analyzer = await AnalyzerFactory.createAnalyzer(workspaceFolder);
		const analysis = await analyzer.analyze();

		reporter.report({ message: "Generating devcontainer.json...", increment: 50 });

		const configManager = ConfigManager.getInstance();
		const preferences = configManager.getPreferences();

		const config: DockerConfig = {
			baseImage: preferences.jdkImage,
			jdkVersion: analysis.jdkVersion,
			port: analysis.port || preferences.port,
			jvmOptions: preferences.jvmOptions,
			enableDebug: preferences.enableDebug,
			debugPort: 5005,
			enableHealthCheck: preferences.enableHealthCheck,
			healthCheckEndpoint: "/actuator/health",
			outputType: analysis.outputType,
			database: analysis.database,
			envVariables: analysis.envVariables,
			composeServices: [],
			volumes: [],
			networks: [],
		};

		const devContainerGenerator = new DevContainerGenerator();
		const devContainerPath = path.join(workspaceFolder.uri.fsPath, ".devcontainer", "devcontainer.json");

		await fs.ensureDir(path.dirname(devContainerPath));
		const content = devContainerGenerator.generate(analysis, config);
		await fs.writeFile(devContainerPath, content, "utf8");

		reporter.report({ message: "Dev container generated!", increment: 20 });

		outputChannel.appendLine(`Generated: ${devContainerPath}`);
		vscode.window.showInformationMessage("Dockeryzen: Dev container generated!");
	});
}

/**
 * Generate from config file
 */
// در تابع generateFromConfig، این بخش را تغییر دهید:

// در تابع generateFromConfig، این بخش را تغییر دهید:

async function generateFromConfig(workspaceFolder: vscode.WorkspaceFolder, config: any, outputChannel: vscode.OutputChannel): Promise<void> {
	const progress = new ProgressReporter();

	await progress.run("Generating from config...", async (reporter) => {
		reporter.report({ message: "Reading config...", increment: 20 });

		// Get databases from config
		const databases = config.databases || [];
		const messageQueues = config.messageQueues || [];
		const services = config.services || [];

		// Convert all databases to DatabaseConfig format
		const databaseConfigs: DatabaseConfig[] = [];
		for (const db of databases) {
			databaseConfigs.push({
				type: db.type as DatabaseType,
				version: db.version || "latest",
				port: db.port || getDefaultPort(db.type),
				name: db.name || "appdb",
				username: db.username || "admin",
				password: db.password || "password",
				host: db.host || db.type,
			});
		}

		// Determine output type - check if pom.xml has WAR packaging
		let outputType = config.project?.outputType as OutputType;

		// Check pom.xml for packaging type
		const pomPath = path.join(workspaceFolder.uri.fsPath, "pom.xml");
		if (await fs.pathExists(pomPath)) {
			const pomContent = await fs.readFile(pomPath, "utf8");
			if (/<packaging>\s*war\s*<\/packaging>/.test(pomContent)) {
				outputType = OutputType.WAR;
			}
		}

		// If no output type specified, detect based on framework
		if (!outputType || outputType === "jar") {
			const framework = config.project?.framework;
			if (framework === "jakarta-ee" || framework === "java-ee" || framework === "spring-mvc") {
				outputType = OutputType.WAR;
			}
		}

		// Filter services to only include real services (not message queues)
		const realServices = services.filter((svc: any) => ["nginx", "grafana", "prometheus", "keycloak", "minio"].includes(svc.type));

		// Map config to DockerConfig
		const dockerConfig: DockerConfig = {
			baseImage: config.docker?.baseImage || config.project?.jdkVendor || "eclipse-temurin",
			jdkVersion: config.project?.jdkVersion || "17",
			port: config.project?.port || 8080,
			jvmOptions: config.docker?.jvmOptions || "-Xmx512m -Xms256m",
			enableDebug: config.docker?.enableDebug || false,
			debugPort: config.docker?.debugPort || 5005,
			enableHealthCheck: config.docker?.enableHealthCheck ?? true,
			healthCheckEndpoint: config.docker?.healthCheckEndpoint || "/actuator/health",
			outputType: outputType,
			databases: databaseConfigs.length > 0 ? databaseConfigs : undefined,
			database: databaseConfigs.length > 0 ? databaseConfigs[0] : undefined,
			envVariables: {},
			composeServices: [],
			volumes: [],
			networks: [],
			generateEnvFile: config.envFile !== false,
			messageQueues: messageQueues as MessageQueueConfig[],
			additionalServices: realServices as AdditionalServiceConfig[],
		};

		reporter.report({ message: "Analyzing project...", increment: 30 });

		const analyzer = await AnalyzerFactory.createAnalyzer(workspaceFolder);
		const analysis = await analyzer.analyze();

		// Override analysis with config values
		if (config.project?.port) {
			analysis.port = config.project.port;
		}
		if (config.project?.jdkVersion) {
			analysis.jdkVersion = config.project.jdkVersion;
		}

		// Set output type based on config
		analysis.outputType = outputType;

		if (databaseConfigs.length > 0) {
			analysis.database = databaseConfigs[0];
		}

		reporter.report({ message: "Generating Docker files...", increment: 40 });

		const outputPath = workspaceFolder.uri.fsPath;
		const generatedFiles: string[] = [];

		// Generate Dockerfile
		const dockerfileGenerator = new DockerfileGenerator();
		const dockerfile = dockerfileGenerator.generate(analysis, dockerConfig);
		await fs.writeFile(path.join(outputPath, "Dockerfile"), dockerfile, "utf8");
		generatedFiles.push("Dockerfile");

		// Generate .dockerignore
		const ignoreGenerator = new IgnoreGenerator();
		const dockerignore = ignoreGenerator.generate();
		await fs.writeFile(path.join(outputPath, ".dockerignore"), dockerignore, "utf8");
		generatedFiles.push(".dockerignore");

		// Generate docker-compose.yml
		const composeGenerator = new ComposeGenerator();
		const compose = composeGenerator.generate(analysis, dockerConfig);
		await fs.writeFile(path.join(outputPath, "docker-compose.yml"), compose, "utf8");
		generatedFiles.push("docker-compose.yml");

		// Generate .env if enabled
		if (config.envFile !== false && (databases.length > 0 || messageQueues.length > 0)) {
			const envGenerator = new EnvGenerator();
			const envContent = envGenerator.generate(analysis, dockerConfig);
			await fs.writeFile(path.join(outputPath, ".env"), envContent, "utf8");
			generatedFiles.push(".env");
		}

		// Generate dev container if enabled
		if (config.devContainer?.enabled) {
			const devContainerGenerator = new DevContainerGenerator();
			const devContainerPath = path.join(outputPath, ".devcontainer", "devcontainer.json");
			await fs.ensureDir(path.dirname(devContainerPath));
			const devContainerContent = devContainerGenerator.generate(analysis, dockerConfig);
			await fs.writeFile(devContainerPath, devContainerContent, "utf8");
			generatedFiles.push(".devcontainer/devcontainer.json");
		}

		reporter.report({ message: "Files generated from config!", increment: 10 });

		outputChannel.appendLine("Generated from config:");
		generatedFiles.forEach((f) => outputChannel.appendLine(`  - ${f}`));

		vscode.window.showInformationMessage(`Dockeryzen: Generated ${generatedFiles.length} files!`);
	});
}

/**
 * Get default port for database type
 */
function getDefaultPort(dbType: string): number {
	const ports: Record<string, number> = {
		postgresql: 5432,
		mysql: 3306,
		mariadb: 3306,
		mongodb: 27017,
		redis: 6379,
		cassandra: 9042,
		elasticsearch: 9200,
		neo4j: 7687,
		h2: 9092,
	};
	return ports[dbType] || 5432;
}

export function deactivate(): void {
	console.log("Dockeryzen extension is now deactivated!");
}
