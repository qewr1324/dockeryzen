import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import type { DockerConfig } from "../types/interfaces";
import { ProjectAnalyzer } from "../core/analyzer/ProjectAnalyzer";
import { DockerfileGenerator } from "../core/generator/DockerfileGenerator";
import { ComposeGenerator } from "../core/generator/ComposeGenerator";
import { IgnoreGenerator } from "../core/generator/IgnoreGenerator";
import { ConfigManager } from "../core/config/ConfigManager";
import { ProgressReporter } from "../ui/ProgressReporter";

/**
 * Quick generate command - uses default settings
 */
export class QuickGenerateCommand {
	/**
	 * Execute quick generate
	 */
	public async execute(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage("No workspace folder found. Please open a Java project first.");
				return;
			}

			const progress = new ProgressReporter();
			const configManager = ConfigManager.getInstance();
			const preferences = configManager.getPreferences();

			await progress.run("Quick generating Docker files...", async (reporter) => {
				reporter.report({ message: "Analyzing project...", increment: 30 });

				const analyzer = await ProjectAnalyzer.createAnalyzer(workspaceFolder);
				const analysis = await analyzer.analyze();

				reporter.report({ message: "Generating files...", increment: 50 });

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

				// Generate files
				const dockerfileGenerator = new DockerfileGenerator();
				const dockerfile = dockerfileGenerator.generate(analysis, config);

				const ignoreGenerator = new IgnoreGenerator();
				const dockerignore = ignoreGenerator.generate();

				const composeGenerator = new ComposeGenerator();
				const compose = composeGenerator.generate(analysis, config);

				// Write files
				const outputPath = workspaceFolder.uri.fsPath;

				await fs.writeFile(path.join(outputPath, "Dockerfile"), dockerfile, "utf8");
				await fs.writeFile(path.join(outputPath, ".dockerignore"), dockerignore, "utf8");

				if (analysis.database || preferences.enableCompose) {
					await fs.writeFile(path.join(outputPath, "docker-compose.yml"), compose, "utf8");
				}

				reporter.report({ message: "Files generated!", increment: 20 });

				vscode.window.showInformationMessage("Dockeryzen: Docker files generated successfully!", "Open Files").then((choice) => {
					if (choice === "Open Files") {
						vscode.workspace.openTextDocument(path.join(outputPath, "Dockerfile")).then((doc) => vscode.window.showTextDocument(doc));
					}
				});
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to generate Docker files: ${error}`);
		}
	}
}
