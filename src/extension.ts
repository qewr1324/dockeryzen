import * as vscode from "vscode";
import { ConfigLoader } from "./core/config/ConfigLoader.js";
import { SettingsPanel } from "./core/ui/SettingsPanel.js";
import { generateFromConfig } from "./core/generator/ConfigGenerator.js";

export function activate(context: vscode.ExtensionContext): void {
	console.log("Dockeryzen extension is now active!");

	const configLoader = new ConfigLoader();

	context.subscriptions.push(
		vscode.commands.registerCommand("dockeryzen.openSettings", async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage("No workspace folder found.");
				return;
			}

			let config = await configLoader.load(workspaceFolder);

			if (!config) {
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

				const format = await vscode.window.showQuickPick(
					[
						{ label: "JSON", description: "dockeryzen.config.json" },
						{ label: "YAML", description: "dockeryzen.config.yaml" },
						{ label: "TOML", description: "dockeryzen.config.toml" },
					],
					{ placeHolder: "Select config format:" },
				);

				if (format) {
					await configLoader.save(workspaceFolder, config, format.label.toLowerCase() as "json" | "yaml" | "toml");
					vscode.window.showInformationMessage(`✅ Config created: dockeryzen.config.${format.label.toLowerCase()}`);
				}
			}

			SettingsPanel.show(config);
		}),

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

			await generateFromConfig(workspaceFolder, config);
		}),

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

export function deactivate(): void {
	console.log("Dockeryzen extension is now deactivated!");
}
