import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import type { ProjectAnalysis, DockerConfig, GenerationResult } from "../types/interfaces";
import { ProjectAnalyzer } from "../core/analyzer/ProjectAnalyzer";
import { DockerfileGenerator } from "../core/generator/DockerfileGenerator";
import { ComposeGenerator } from "../core/generator/ComposeGenerator";
import { IgnoreGenerator } from "../core/generator/IgnoreGenerator";
import { DevContainerGenerator } from "../core/generator/DevContainerGenerator";
import { Wizard } from "../ui/Wizard";
import { ProgressReporter } from "../ui/ProgressReporter";

/**
 * Generate Docker files command
 */
export class GenerateCommand {
	/**
	 * Execute the generate command
	 */
	public async execute(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage("No workspace folder found. Please open a Java project first.");
				return;
			}

			// Show progress
			const progress = new ProgressReporter();

			await progress.run("Analyzing project...", async (reporter) => {
				reporter.report({ message: "Detecting build tool...", increment: 10 });

				const analyzer = await ProjectAnalyzer.createAnalyzer(workspaceFolder);

				reporter.report({ message: "Analyzing project structure...", increment: 30 });
				const analysis = await analyzer.analyze();

				reporter.report({ message: "Configuring Docker settings...", increment: 20 });

				// Run wizard
				const wizard = new Wizard(analysis);
				const config = await wizard.run();

				if (!config) {
					reporter.report({ message: "Generation cancelled", increment: 100 });
					return;
				}

				reporter.report({ message: "Generating Docker files...", increment: 30 });

				const result = await this.generateFiles(workspaceFolder, analysis, config);

				reporter.report({ message: "Files generated successfully!", increment: 10 });

				await this.showResults(result);
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to generate Docker files: ${error}`);
		}
	}

	/**
	 * Generate all Docker files
	 */
	private async generateFiles(workspaceFolder: vscode.WorkspaceFolder, analysis: ProjectAnalysis, config: DockerConfig): Promise<GenerationResult> {
		const result: GenerationResult = {
			files: [],
			warnings: [],
			errors: [],
		};

		try {
			const outputPath = this.getOutputPath(workspaceFolder);

			// Generate Dockerfile
			const dockerfileGenerator = new DockerfileGenerator();
			const dockerfile = dockerfileGenerator.generate(analysis, config);
			result.files.push({
				path: path.join(outputPath, "Dockerfile"),
				content: dockerfile,
				type: "dockerfile",
			});

			// Generate .dockerignore
			const ignoreGenerator = new IgnoreGenerator();
			const dockerignore = ignoreGenerator.generate();
			result.files.push({
				path: path.join(outputPath, ".dockerignore"),
				content: dockerignore,
				type: "dockerignore",
			});

			// Generate docker-compose.yml
			if (config.composeServices || config.database) {
				const composeGenerator = new ComposeGenerator();
				const compose = composeGenerator.generate(analysis, config);
				result.files.push({
					path: path.join(outputPath, "docker-compose.yml"),
					content: compose,
					type: "compose",
				});
			}

			// Generate .env file if needed
			if (config.envVariables && Object.keys(config.envVariables).length > 0) {
				const envContent = Object.entries(config.envVariables)
					.map(([key, value]) => `${key}=${value}`)
					.join("\n");
				result.files.push({
					path: path.join(outputPath, ".env"),
					content: envContent,
					type: "env",
				});
			}

			// Write files to disk
			for (const file of result.files) {
				await fs.ensureDir(path.dirname(file.path));
				await fs.writeFile(file.path, file.content, "utf8");
			}

			return result;
		} catch (error) {
			result.errors.push(`Failed to generate files: ${error}`);
			return result;
		}
	}

	/**
	 * Get output path
	 */
	private getOutputPath(workspaceFolder: vscode.WorkspaceFolder): string {
		const config = vscode.workspace.getConfiguration("dockeryzen");
		const customPath = config.get("outputPath") as string;

		if (customPath && customPath.trim()) {
			if (path.isAbsolute(customPath)) {
				return customPath;
			}
			return path.join(workspaceFolder.uri.fsPath, customPath);
		}

		return workspaceFolder.uri.fsPath;
	}

	/**
	 * Show generation results
	 */
	private async showResults(result: GenerationResult): Promise<void> {
		if (result.errors.length > 0) {
			vscode.window.showErrorMessage(`Dockeryzen: ${result.errors[0]}`);
			return;
		}

		const fileList = result.files.map((f) => path.basename(f.path)).join(", ");

		const action = await vscode.window.showInformationMessage(`Dockeryzen: Generated ${result.files.length} files: ${fileList}`, "Open Files", "Run docker-compose up", "Dismiss");

		if (action === "Open Files") {
			for (const file of result.files) {
				const doc = await vscode.workspace.openTextDocument(file.path);
				await vscode.window.showTextDocument(doc);
			}
		} else if (action === "Run docker-compose up") {
			const terminal = vscode.window.createTerminal("Dockeryzen");
			terminal.show();
			terminal.sendText("docker-compose up -d");
		}
	}
}
