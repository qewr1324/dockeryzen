import * as vscode from "vscode";
import { DatabaseConfig } from "../types/index.js";

// Use require with any type
const sqlDatabases: any = require("../config/databases/sql.json");
const nosqlDatabases: any = require("../config/databases/nosql.json");
const keyValueDatabases: any = require("../config/databases/key-value.json");
const wideColumnDatabases: any = require("../config/databases/wide-column.json");
const graphDatabases: any = require("../config/databases/graph.json");
const timeSeriesDatabases: any = require("../config/databases/time-series.json");
const searchEngineDatabases: any = require("../config/databases/search-engines.json");
const newsqlDatabases: any = require("../config/databases/newsql.json");
const vectorDatabases: any = require("../config/databases/vector.json");

export class DatabaseManager {
	private databases: DatabaseConfig[] = [];

	async selectDatabases(currentStep: number, totalSteps: number): Promise<DatabaseConfig[] | "back" | "cancel"> {
		this.databases = [];
		const allDatabases = this.getAllDatabases();

		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: Select Databases`;
		quickPick.placeholder = "Select databases (multi-select) - Press Enter when done";
		quickPick.items = allDatabases.map((db) => ({
			label: `$(${db.icon}) ${db.label}`,
			description: db.category,
			detail: `Port: ${db.defaultPort} | Version: ${db.versions[0].label}`,
			value: db.value,
			defaultPort: db.defaultPort,
			defaultUser: db.defaultUser,
			defaultDatabase: db.defaultDatabase,
			versions: db.versions,
			picked: false,
		}));
		quickPick.canSelectMany = true;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.buttons = [
			{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" },
			{ iconPath: new vscode.ThemeIcon("check"), tooltip: "OK" },
		];

		let isResolved = false;

		return new Promise((resolve) => {
			quickPick.onDidAccept(() => {
				if (isResolved) return;
				isResolved = true;
				const selected = quickPick.selectedItems as any[];
				quickPick.dispose();

				if (selected.length === 0) {
					resolve([]);
					return;
				}

				const result = this.showSelectedDatabasesWithEdit(selected, currentStep, totalSteps);
				resolve(result);
			});

			quickPick.onDidTriggerButton((button) => {
				if (isResolved) return;

				if (button.tooltip === "Back") {
					isResolved = true;
					quickPick.dispose();
					resolve("back");
				} else if (button.tooltip === "OK") {
					isResolved = true;
					const selected = quickPick.selectedItems as any[];
					quickPick.dispose();

					if (selected.length === 0) {
						resolve([]);
						return;
					}

					const result = this.showSelectedDatabasesWithEdit(selected, currentStep, totalSteps);
					resolve(result);
				}
			});

			quickPick.onDidHide(() => {
				if (!isResolved) {
					isResolved = true;
					quickPick.dispose();
					resolve("cancel");
				}
			});

			quickPick.show();
		});
	}

	private getAllDatabases(): any[] {
		const allDatabases: any[] = [];

		const configs: any[] = [sqlDatabases, nosqlDatabases, keyValueDatabases, wideColumnDatabases, graphDatabases, timeSeriesDatabases, searchEngineDatabases, newsqlDatabases, vectorDatabases];

		for (const config of configs) {
			if (config.databases) {
				for (const db of config.databases) {
					allDatabases.push({
						...db,
						category: config.category,
					});
				}
			}
		}

		return allDatabases;
	}

	private async showSelectedDatabasesWithEdit(selectedDbs: any[], currentStep: number, totalSteps: number): Promise<DatabaseConfig[] | "back" | "cancel"> {
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: Configure Databases`;
		quickPick.placeholder = "Click on a database to edit it, or press Enter to continue with defaults";
		quickPick.items = selectedDbs.map((db) => ({
			label: `$(${db.icon}) ${db.label}`,
			description: db.configured ? "$(check) Configured" : "$(gear) Click to Edit",
			detail: `Port: ${db.defaultPort} | Version: ${db.versions[0].label}`,
			value: db.value,
			defaultPort: db.defaultPort,
			defaultUser: db.defaultUser,
			defaultDatabase: db.defaultDatabase,
			versions: db.versions,
			configured: db.configured || false,
		}));
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.buttons = [
			{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" },
			{ iconPath: new vscode.ThemeIcon("check"), tooltip: "OK" },
		];

		let isResolved = false;

		return new Promise((resolve) => {
			quickPick.onDidAccept(async () => {
				if (isResolved) return;

				const selected = quickPick.selectedItems[0] as any;
				if (selected) {
					isResolved = true;
					quickPick.dispose();

					const config = await this.askDatabaseConfig(selected, currentStep, totalSteps);

					if (config === "back") {
						resolve("back");
						return;
					}
					if (config === "cancel") {
						resolve("cancel");
						return;
					}
					if (config) {
						const exists = this.databases.some((d) => d.type === config.type);
						if (!exists) {
							this.databases.push(config);
						} else {
							const index = this.databases.findIndex((d) => d.type === config.type);
							this.databases[index] = config;
						}
						selected.configured = true;
					}

					const result = await this.showSelectedDatabasesWithEdit(selectedDbs, currentStep, totalSteps);
					resolve(result);
				}
			});

			quickPick.onDidTriggerButton((button) => {
				if (isResolved) return;

				isResolved = true;
				quickPick.dispose();

				if (button.tooltip === "Back") {
					resolve("back");
				} else {
					// OK - Continue with defaults for unconfigured databases
					for (const db of selectedDbs) {
						if (!db.configured) {
							const exists = this.databases.some((d) => d.type === db.value);
							if (!exists) {
								this.databases.push({
									type: db.value,
									version: db.versions[0].value,
									internalPort: db.defaultPort,
									externalPort: db.defaultPort,
									databaseName: db.defaultDatabase,
									username: db.defaultUser,
									password: "root",
									useAlpine: false,
									image: db.versions[0].image,
									alpineImage: db.versions[0].alpineImage,
								});
							}
						}
					}
					resolve(this.databases);
				}
			});

			quickPick.onDidHide(() => {
				if (!isResolved) {
					isResolved = true;
					quickPick.dispose();
					resolve("cancel");
				}
			});

			quickPick.show();
		});
	}

	private async askDatabaseConfig(db: any, currentStep: number, totalSteps: number): Promise<DatabaseConfig | "back" | "cancel" | undefined> {
		const configMethod = await this.showQuickPickWithBack(
			`Configure ${db.label}`,
			[
				{ label: "$(check) Use Defaults", description: "Use default settings", detail: "Quick setup with recommended defaults", value: "defaults" },
				{ label: "$(settings-gear) Edit Part", description: "Configure individual settings", detail: "Set version, ports, credentials manually", value: "part" },
				{ label: "$(link) Edit URL", description: "Use external connection URL", detail: "Connect to external database instance", value: "url" },
			],
			currentStep,
			totalSteps,
		);

		if (configMethod === "back") return "back";
		if (configMethod === "cancel") return "cancel";
		if (!configMethod) return undefined;

		if (configMethod.value === "defaults") {
			const defaultVersion = db.versions[0];
			return {
				type: db.value,
				version: defaultVersion.value,
				internalPort: db.defaultPort,
				externalPort: db.defaultPort,
				databaseName: db.defaultDatabase,
				username: db.defaultUser,
				password: "root",
				useAlpine: false,
				image: defaultVersion.image,
				alpineImage: defaultVersion.alpineImage,
			};
		}

		if (configMethod.value === "url") {
			const url = await this.showInputBoxWithBack(`Enter ${db.label} connection URL`, "postgresql://user:pass@host:port/dbname", currentStep, totalSteps);

			if (url === "back") return "back";
			if (url === "cancel") return "cancel";
			if (!url) return undefined;

			return {
				type: db.value,
				version: "latest",
				internalPort: db.defaultPort,
				externalPort: db.defaultPort,
				useAlpine: false,
				useExternalUrl: true,
				url: url,
			};
		}

		// Edit Part - Version
		const versionItems = db.versions.map((v: any) => ({
			label: `$(tag) ${v.label}`,
			description: `Version ${v.value}`,
			detail: v.image ? `Image: ${v.image}` : "External registry",
			value: v.value,
			image: v.image,
			alpineImage: v.alpineImage,
		}));

		const version = await this.showQuickPickWithBack(`Select ${db.label} Version`, versionItems, currentStep, totalSteps);
		if (version === "back") return "back";
		if (version === "cancel") return "cancel";
		if (!version) return undefined;

		// Internal port
		const internalPort = await this.showInputBoxWithBack(`Enter ${db.label} Internal Port`, db.defaultPort.toString(), currentStep, totalSteps);
		if (internalPort === "back") return "back";
		if (internalPort === "cancel") return "cancel";
		if (!internalPort) return undefined;

		// External port
		const externalPort = await this.showInputBoxWithBack(`Enter ${db.label} External Port`, internalPort, currentStep, totalSteps);
		if (externalPort === "back") return "back";
		if (externalPort === "cancel") return "cancel";
		if (!externalPort) return undefined;

		// Database name
		let databaseName: string | undefined;
		if (db.defaultDatabase) {
			const dbName = await this.showInputBoxWithBack(`Enter Database Name for ${db.label}`, db.defaultDatabase, currentStep, totalSteps);
			if (dbName === "back") return "back";
			if (dbName === "cancel") return "cancel";
			databaseName = dbName;
		}

		// Username
		const username = await this.showInputBoxWithBack(`Enter Username for ${db.label}`, db.defaultUser, currentStep, totalSteps);
		if (username === "back") return "back";
		if (username === "cancel") return "cancel";
		if (!username) return undefined;

		// Password
		const password = await this.showInputBoxWithBack(`Enter Password for ${db.label}`, "root", currentStep, totalSteps, true);
		if (password === "back") return "back";
		if (password === "cancel") return "cancel";

		// Alpine option
		const useAlpine = await this.showQuickPickWithBack(
			`Use Alpine Version for ${db.label}?`,
			[
				{ label: "$(check) Yes", description: "Alpine-based image", detail: "Smaller image size", value: "yes" },
				{ label: "$(x) No", description: "Standard image", detail: "Full-featured image", value: "no" },
			],
			currentStep,
			totalSteps,
		);
		if (useAlpine === "back") return "back";
		if (useAlpine === "cancel") return "cancel";

		return {
			type: db.value,
			version: version.value,
			internalPort: parseInt(internalPort),
			externalPort: parseInt(externalPort),
			databaseName: databaseName,
			username: username,
			password: password || "root",
			useAlpine: useAlpine?.value === "yes",
			image: version.image,
			alpineImage: version.alpineImage,
		};
	}

	private showQuickPickWithBack(title: string, items: any[], currentStep: number, totalSteps: number): Promise<any> {
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: ${title}`;
		quickPick.items = items;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.buttons = [{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" }];

		let isResolved = false;

		return new Promise((resolve) => {
			quickPick.onDidAccept(() => {
				if (!isResolved) {
					isResolved = true;
					const selected = quickPick.selectedItems[0];
					quickPick.dispose();
					resolve(selected);
				}
			});

			quickPick.onDidTriggerButton((button) => {
				if (!isResolved) {
					isResolved = true;
					quickPick.dispose();
					resolve("back");
				}
			});

			quickPick.onDidHide(() => {
				if (!isResolved) {
					isResolved = true;
					quickPick.dispose();
					resolve("cancel");
				}
			});

			quickPick.show();
		});
	}

	private showInputBoxWithBack(title: string, value: string, currentStep: number, totalSteps: number, isPassword = false): Promise<string | "back" | "cancel"> {
		const inputBox = vscode.window.createInputBox();
		inputBox.title = `Step ${currentStep + 1}/${totalSteps}: ${title}`;
		inputBox.value = value;
		inputBox.password = isPassword;
		inputBox.buttons = [
			{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" },
			{ iconPath: new vscode.ThemeIcon("check"), tooltip: "OK" },
		];

		let isResolved = false;

		return new Promise((resolve) => {
			const acceptValue = () => {
				if (!isResolved) {
					isResolved = true;
					const value = inputBox.value;
					inputBox.dispose();
					resolve(value);
				}
			};

			inputBox.onDidAccept(acceptValue);

			inputBox.onDidTriggerButton((button) => {
				if (!isResolved) {
					if (button.tooltip === "Back") {
						isResolved = true;
						inputBox.dispose();
						resolve("back");
					} else if (button.tooltip === "OK") {
						acceptValue();
					}
				}
			});

			inputBox.onDidHide(() => {
				if (!isResolved) {
					isResolved = true;
					inputBox.dispose();
					resolve("cancel");
				}
			});

			inputBox.show();
		});
	}
}
