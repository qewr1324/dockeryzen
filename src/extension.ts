import * as vscode from "vscode";
import { DockerWizard } from "./wizard/DockerWizard.js";

export function activate(context: vscode.ExtensionContext) {
	console.log("Dockeryzen is now active!");

	// Register the main command
	const generateCommand = vscode.commands.registerCommand("dockeryzen.generateFromConfig", async () => {
		try {
			const wizard = new DockerWizard();
			await wizard.start();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error occurred";
			vscode.window.showErrorMessage(`Dockeryzen Error: ${message}`);
			console.error("Dockeryzen Error:", error);
		}
	});

	// Register settings command
	const settingsCommand = vscode.commands.registerCommand("dockeryzen.openSettings", async () => {
		try {
			const wizard = new DockerWizard();
			await wizard.start();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error occurred";
			vscode.window.showErrorMessage(`Dockeryzen Error: ${message}`);
			console.error("Dockeryzen Error:", error);
		}
	});

	context.subscriptions.push(generateCommand, settingsCommand);
}

export function deactivate() {
	console.log("Dockeryzen is now deactivated!");
}
