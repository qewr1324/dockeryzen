import * as vscode from "vscode";
import { AnalyzeCommand } from "./core/commands/AnalyzeCommand.js";
import { GenerateCommand } from "./core/commands/GenerateCommand.js";
import { QuickGenerateCommand } from "./core/commands/QuickGenerateCommand.js";
import { ConfigManager } from "./core/config/ConfigManager.js";
import { ProgressReporter } from "./core/ui/ProgressReporter.js";

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
	console.log("Dockeryzen extension is now active!");

	// Initialize configuration manager
	const configManager = ConfigManager.getInstance();

	// Create output channel
	const outputChannel = vscode.window.createOutputChannel("Dockeryzen");

	// Create commands
	const analyzeCommand = new AnalyzeCommand();
	const generateCommand = new GenerateCommand();
	const quickGenerateCommand = new QuickGenerateCommand();

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand("dockeryzen.analyze", async () => {
			outputChannel.show();
			outputChannel.appendLine("Starting project analysis...");
			await analyzeCommand.execute();
			outputChannel.appendLine("Analysis completed.");
		}),

		vscode.commands.registerCommand("dockeryzen.generate", async () => {
			outputChannel.show();
			outputChannel.appendLine("Starting Docker file generation...");
			await generateCommand.execute();
			outputChannel.appendLine("Generation completed.");
		}),

		vscode.commands.registerCommand("dockeryzen.generate-all", async () => {
			outputChannel.show();
			outputChannel.appendLine("Starting automatic generation...");
			await generateCommand.execute();
			outputChannel.appendLine("Automatic generation completed.");
		}),

		vscode.commands.registerCommand("dockeryzen.quick-generate", async () => {
			outputChannel.show();
			outputChannel.appendLine("Starting quick generation...");
			await quickGenerateCommand.execute();
			outputChannel.appendLine("Quick generation completed.");
		}),

		vscode.commands.registerCommand("dockeryzen.update", async () => {
			outputChannel.show();
			outputChannel.appendLine("Updating existing Docker files...");
			// TODO: Implement update command
			vscode.window.showInformationMessage("Dockeryzen: Update feature coming soon!");
		}),

		vscode.commands.registerCommand("dockeryzen.add-database", async () => {
			outputChannel.show();
			outputChannel.appendLine("Adding database service...");
			// TODO: Implement add-database command
			vscode.window.showInformationMessage("Dockeryzen: Add database feature coming soon!");
		}),

		vscode.commands.registerCommand("dockeryzen.show-logs", () => {
			outputChannel.show();
		}),

		vscode.commands.registerCommand("dockeryzen.health-check", async () => {
			outputChannel.show();
			outputChannel.appendLine("Checking container health...");
			// TODO: Implement health check command
			vscode.window.showInformationMessage("Dockeryzen: Health check feature coming soon!");
		}),

		vscode.commands.registerCommand("dockeryzen.generate-dev-container", async () => {
			outputChannel.show();
			outputChannel.appendLine("Generating dev container...");
			// TODO: Implement dev container generation
			vscode.window.showInformationMessage("Dockeryzen: Dev container generation coming soon!");
		}),
	);

	// Register status bar item
	// const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	// statusBarItem.command = "dockeryzen.generate";
	// statusBarItem.text = "$(container) Dockeryzen";
	// statusBarItem.tooltip = "Generate Docker files for Java project";
	// statusBarItem.show();

	// context.subscriptions.push(statusBarItem);

	// Set context for view welcome
	vscode.commands.executeCommand("setContext", "dockeryzen.hasContainers", false);

	console.log("Dockeryzen extension activated successfully!");
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
	console.log("Dockeryzen extension is now deactivated!");
}
