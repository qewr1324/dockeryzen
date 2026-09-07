import * as vscode from "vscode";
import { AnalyzeCommand } from "./core/commands/AnalyzeCommand.js";
import { GenerateCommand } from "./core/commands/GenerateCommand.js";
import { QuickGenerateCommand } from "./core/commands/QuickGenerateCommand.js";
import { AddDatabaseCommand } from "./core/commands/AddDatabaseCommand.js";
import { UpdateCommand } from "./core/commands/UpdateCommand.js";
import { ConfigManager } from "./core/config/ConfigManager.js";

export function activate(context: vscode.ExtensionContext): void {
	console.log("Dockeryzen extension is now active!");

	const configManager = ConfigManager.getInstance();
	const outputChannel = vscode.window.createOutputChannel("Dockeryzen");

	const analyzeCommand = new AnalyzeCommand();
	const generateCommand = new GenerateCommand();
	const quickGenerateCommand = new QuickGenerateCommand();
	const addDatabaseCommand = new AddDatabaseCommand();
	const updateCommand = new UpdateCommand();

	context.subscriptions.push(
		vscode.commands.registerCommand("dockeryzen.analyze", async () => {
			await analyzeCommand.execute();
		}),

		vscode.commands.registerCommand("dockeryzen.generate", async () => {
			await generateCommand.execute();
		}),

		vscode.commands.registerCommand("dockeryzen.generate-all", async () => {
			await generateCommand.execute();
		}),

		vscode.commands.registerCommand("dockeryzen.quick-generate", async () => {
			await quickGenerateCommand.execute();
		}),

		vscode.commands.registerCommand("dockeryzen.update", async () => {
			await updateCommand.execute();
		}),

		vscode.commands.registerCommand("dockeryzen.add-database", async () => {
			await addDatabaseCommand.execute();
		}),

		vscode.commands.registerCommand("dockeryzen.show-logs", () => {
			outputChannel.show();
		}),

		vscode.commands.registerCommand("dockeryzen.health-check", async () => {
			vscode.window.showInformationMessage("Dockeryzen: Health check feature coming soon!");
		}),

		vscode.commands.registerCommand("dockeryzen.generate-dev-container", async () => {
			vscode.window.showInformationMessage("Dockeryzen: Dev container generation coming soon!");
		}),
	);

	console.log("Dockeryzen extension activated successfully!");
}

export function deactivate(): void {
	console.log("Dockeryzen extension is now deactivated!");
}

// Register status bar item
// const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
// statusBarItem.command = "dockeryzen.generate";
// statusBarItem.text = "$(container) Dockeryzen";
// statusBarItem.tooltip = "Generate Docker files for Java project";
// statusBarItem.show();

// context.subscriptions.push(statusBarItem);

// Set context for view welcome
