import * as vscode from "vscode";
import { StatusBarManager } from "./statusBarManager.js";
import { registerFacetCommands } from "./facetCommands.js";
import { ConfigLoader } from "./utils/configLoader.js";

export function activate(context: vscode.ExtensionContext) {
	console.log("🚀 Code Facet Generator activated");

	// Initialize Config Loader
	const configLoader = new ConfigLoader(context);

	// Initialize Status Bar
	const statusBarManager = new StatusBarManager(context, configLoader);

	// Register all commands (without tree provider)
	registerFacetCommands(context, configLoader);

	// Add to subscriptions
	context.subscriptions.push(statusBarManager);

	// Show welcome message
	// vscode.window.showInformationMessage("🎯 Code Facet Generator ready! Click the facet icon in status bar.");
}

export function deactivate() {}
