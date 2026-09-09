import * as vscode from "vscode";
import { DockerWizard } from "./wizard/DockerWizard.js";

export function activate(context: vscode.ExtensionContext) {
	console.log("Dockeryzen is now active!");

	try {
		const generateCommand = vscode.commands.registerCommand("dockeryzen.generateFromConfig", async () => {
			try {
				const wizard = new DockerWizard(context);
				await wizard.start();
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error occurred";
				vscode.window.showErrorMessage(`Dockeryzen Error: ${message}`);
				console.error("Dockeryzen Error:", error);
			}
		});

		const settingsCommand = vscode.commands.registerCommand("dockeryzen.openSettings", async () => {
			try {
				await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:GhurbeSABZI.dockeryzen");
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error occurred";
				vscode.window.showErrorMessage(`Dockeryzen Error: ${message}`);
				console.error("Dockeryzen Error:", error);
			}
		});

		const configSettingsCommand = vscode.commands.registerCommand("dockeryzen.openConfigSettings", async () => {
			try {
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
				if (!workspaceFolder) {
					vscode.window.showWarningMessage("Please open a workspace folder first.");
					return;
				}

				const configPath = vscode.Uri.joinPath(workspaceFolder.uri, ".dockeryzen.json");
				try {
					const doc = await vscode.workspace.openTextDocument(configPath);
					await vscode.window.showTextDocument(doc);
				} catch {
					const defaultConfig = {
						projectName: workspaceFolder.name,
						port: vscode.workspace.getConfiguration("dockeryzen").get("defaultPort", 8080),
						useAlpine: vscode.workspace.getConfiguration("dockeryzen").get("useAlpineByDefault", false),
						enableHealthCheck: vscode.workspace.getConfiguration("dockeryzen").get("enableHealthCheckByDefault", false),
						enableDebug: vscode.workspace.getConfiguration("dockeryzen").get("enableDebugByDefault", false),
					};

					await vscode.workspace.fs.writeFile(configPath, Buffer.from(JSON.stringify(defaultConfig, null, 2)));

					const doc = await vscode.workspace.openTextDocument(configPath);
					await vscode.window.showTextDocument(doc);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error occurred";
				vscode.window.showErrorMessage(`Dockeryzen Error: ${message}`);
				console.error("Dockeryzen Error:", error);
			}
		});

		context.subscriptions.push(generateCommand, settingsCommand, configSettingsCommand);
	} catch (error) {
		console.error("Failed to activate Dockeryzen:", error);
		vscode.window.showErrorMessage("Failed to activate Dockeryzen extension");
	}
}

export function deactivate() {
	console.log("Dockeryzen is now deactivated!");
}
