import * as vscode from "vscode";
import { ProjectAnalyzer } from "../analyzer/ProjectAnalyzer.js";
import { ProgressReporter } from "../ui/ProgressReporter.js";

/**
 * Analyze Java project command
 */
export class AnalyzeCommand {
	/**
	 * Execute the analyze command
	 */
	public async execute(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage("No workspace folder found. Please open a Java project first.");
				return;
			}

			const progress = new ProgressReporter();

			await progress.run("Analyzing project...", async (reporter) => {
				reporter.report({ message: "Detecting build tool...", increment: 20 });

				const analyzer = await ProjectAnalyzer.createAnalyzer(workspaceFolder);

				reporter.report({ message: "Analyzing project structure...", increment: 40 });
				const analysis = await analyzer.analyze();

				reporter.report({ message: "Analysis completed!", increment: 40 });

				this.showAnalysisResults(analysis);
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to analyze project: ${error}`);
		}
	}

	/**
	 * Show analysis results
	 */
	private showAnalysisResults(analysis: any): void {
		const details = [
			`Project Type: ${analysis.projectType}`,
			`Build Tool: ${analysis.buildTool}`,
			`Framework: ${analysis.framework}`,
			`JDK Version: ${analysis.jdkVersion}`,
			`JDK Vendor: ${analysis.jdkVendor}`,
			`Application Port: ${analysis.port}`,
			`Output Type: ${analysis.outputType}`,
			`Main Class: ${analysis.mainClass || "Not found"}`,
		];

		if (analysis.database) {
			details.push(`Database: ${analysis.database.type} (v${analysis.database.version})`);
			details.push(`Database Name: ${analysis.database.name}`);
		}

		if (analysis.dependencies.length > 0) {
			details.push(`Dependencies: ${analysis.dependencies.length} found`);
		}

		if (analysis.profiles) {
			details.push(`Spring Profiles: ${analysis.profiles.join(", ")}`);
		}

		vscode.window.showInformationMessage(`Dockeryzen Analysis:\n${details.join("\n")}`, "OK");
	}
}
