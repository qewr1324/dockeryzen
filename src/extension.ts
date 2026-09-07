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
import type { DockerConfig, ProjectAnalysis } from "./types/interfaces.js";

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

			SettingsPanel.show(config, workspaceFolder);
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
				SettingsPanel.show(config, workspaceFolder);
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
async function generateFromConfig(workspaceFolder: vscode.WorkspaceFolder, config: any, outputChannel: vscode.OutputChannel): Promise<void> {
	const progress = new ProgressReporter();

	await progress.run("Generating from config...", async (reporter) => {
		reporter.report({ message: "Reading config...", increment: 20 });

		// Map config to DockerConfig
		const dockerConfig: DockerConfig = {
			baseImage: config.docker?.baseImage || config.project?.jdkVendor || "eclipse-temurin",
			jdkVersion: config.project?.jdkVersion || "17",
			port: config.project?.port || 8080,
			jvmOptions: config.docker?.useAlpine ? `${config.docker?.jvmOptions || "-Xmx512m -Xms256m"} alpine` : config.docker?.jvmOptions || "-Xmx512m -Xms256m",
			enableDebug: config.docker?.enableDebug || false,
			debugPort: config.docker?.debugPort || 5005,
			enableHealthCheck: config.docker?.enableHealthCheck ?? true,
			healthCheckEndpoint: config.docker?.healthCheckEndpoint || "/actuator/health",
			outputType: config.project?.outputType || "jar",
			database: config.databases?.[0],
			envVariables: {},
			composeServices: config.services || [],
			volumes: [],
			networks: [],
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
		if (config.project?.outputType) {
			analysis.outputType = config.project.outputType;
		}
		if (config.databases?.length > 0) {
			analysis.database = config.databases[0];
		}

		reporter.report({ message: "Generating Docker files...", increment: 40 });

		const outputPath = workspaceFolder.uri.fsPath;

		// Generate Dockerfile
		const dockerfileGenerator = new DockerfileGenerator();
		const dockerfile = dockerfileGenerator.generate(analysis, dockerConfig);
		await fs.writeFile(path.join(outputPath, "Dockerfile"), dockerfile, "utf8");

		// Generate .dockerignore
		const ignoreGenerator = new IgnoreGenerator();
		const dockerignore = ignoreGenerator.generate();
		await fs.writeFile(path.join(outputPath, ".dockerignore"), dockerignore, "utf8");

		// Generate docker-compose.yml
		const composeGenerator = new ComposeGenerator();
		const compose = composeGenerator.generate(analysis, dockerConfig);
		await fs.writeFile(path.join(outputPath, "docker-compose.yml"), compose, "utf8");

		// Generate .env if enabled
		if (config.envFile !== false) {
			const envGenerator = new EnvGenerator();
			const envContent = envGenerator.generate(analysis, dockerConfig);
			await fs.writeFile(path.join(outputPath, ".env"), envContent, "utf8");
		}

		// Generate dev container if enabled
		if (config.devContainer?.enabled) {
			const devContainerGenerator = new DevContainerGenerator();
			const devContainerPath = path.join(outputPath, ".devcontainer", "devcontainer.json");
			await fs.ensureDir(path.dirname(devContainerPath));
			const devContent = devContainerGenerator.generate(analysis, dockerConfig);
			await fs.writeFile(devContainerPath, devContent, "utf8");
		}

		reporter.report({ message: "Files generated from config!", increment: 10 });

		outputChannel.appendLine("Generated from config:");
		outputChannel.appendLine("  - Dockerfile");
		outputChannel.appendLine("  - .dockerignore");
		outputChannel.appendLine("  - docker-compose.yml");
		if (config.envFile !== false) {
			outputChannel.appendLine("  - .env");
		}
		if (config.devContainer?.enabled) {
			outputChannel.appendLine("  - .devcontainer/devcontainer.json");
		}

		vscode.window.showInformationMessage("Dockeryzen: Generated from config file!");
	});
}

export function deactivate(): void {
	console.log("Dockeryzen extension is now deactivated!");
}
