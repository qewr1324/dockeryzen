import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import { AnalyzerFactory } from "../analyzer/AnalyzerFactory.js";
import { DockerfileGenerator } from "../generator/DockerfileGenerator.js";
import { ComposeGenerator } from "../generator/ComposeGenerator.js";
import { ConfigManager } from "../config/ConfigManager.js";
import { ProgressReporter } from "../ui/ProgressReporter.js";
import type { DockerConfig } from "../../types/interfaces.js";

/**
 * Update existing Docker files
 */
export class UpdateCommand {
	/**
	 * Execute update command
	 */
	public async execute(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage("No workspace folder found.");
				return;
			}

			const progress = new ProgressReporter();
			const configManager = ConfigManager.getInstance();
			const preferences = configManager.getPreferences();

			await progress.run("Updating Docker files...", async (reporter) => {
				reporter.report({ message: "Analyzing project...", increment: 30 });

				const analyzer = await AnalyzerFactory.createAnalyzer(workspaceFolder);
				const analysis = await analyzer.analyze();

				reporter.report({ message: "Updating files...", increment: 50 });

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

				// Generate updated files
				const dockerfileGenerator = new DockerfileGenerator();
				const dockerfile = dockerfileGenerator.generate(analysis, config);

				const composeGenerator = new ComposeGenerator();
				const compose = composeGenerator.generate(analysis, config);

				// Write updated files
				const outputPath = workspaceFolder.uri.fsPath;
				await fs.writeFile(path.join(outputPath, "Dockerfile"), dockerfile, "utf8");
				await fs.writeFile(path.join(outputPath, "docker-compose.yml"), compose, "utf8");

				reporter.report({ message: "Files updated!", increment: 20 });

				vscode.window.showInformationMessage("Dockeryzen: Docker files updated successfully!");
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to update Docker files: ${error}`);
		}
	}
}
