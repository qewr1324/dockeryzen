import * as vscode from "vscode";
import { DatabaseConfig } from "../types/index.js";
import { validatePort } from "../utils/helpers.js";

import sqlDatabases from "../config/databases/sql.json" with { type: "json" };
import nosqlDatabases from "../config/databases/nosql.json" with { type: "json" };
import keyValueDatabases from "../config/databases/key-value.json" with { type: "json" };
import wideColumnDatabases from "../config/databases/wide-column.json" with { type: "json" };
import graphDatabases from "../config/databases/graph.json" with { type: "json" };
import timeSeriesDatabases from "../config/databases/time-series.json" with { type: "json" };
import searchEngineDatabases from "../config/databases/search-engines.json" with { type: "json" };
import newsqlDatabases from "../config/databases/newsql.json" with { type: "json" };
import vectorDatabases from "../config/databases/vector.json" with { type: "json" };

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
		const disposables: vscode.Disposable[] = [];

		return new Promise((resolve) => {
			const cleanup = () => {
				disposables.forEach((d) => d.dispose());
				quickPick.dispose();
			};

			disposables.push(
				quickPick.onDidAccept(() => {
					if (isResolved) return;
					isResolved = true;
					const selected = quickPick.selectedItems as any[];
					cleanup();

					if (selected.length === 0) {
						resolve([]);
						return;
					}

					const result = this.showSelectedDatabasesWithEdit(selected, currentStep, totalSteps);
					resolve(result);
				}),
				quickPick.onDidTriggerButton((button) => {
					if (isResolved) return;

					if (button.tooltip === "Back") {
						isResolved = true;
						cleanup();
						resolve("back");
					} else if (button.tooltip === "OK") {
						isResolved = true;
						const selected = quickPick.selectedItems as any[];
						cleanup();

						if (selected.length === 0) {
							resolve([]);
							return;
						}

						const result = this.showSelectedDatabasesWithEdit(selected, currentStep, totalSteps);
						resolve(result);
					}
				}),
				quickPick.onDidHide(() => {
					if (!isResolved) {
						isResolved = true;
						cleanup();
						resolve("cancel");
					}
				}),
			);

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
		const disposables: vscode.Disposable[] = [];

		return new Promise((resolve) => {
			const cleanup = () => {
				disposables.forEach((d) => d.dispose());
				quickPick.dispose();
			};

			disposables.push(
				quickPick.onDidAccept(async () => {
					if (isResolved) return;

					const selected = quickPick.selectedItems[0] as any;
					if (selected) {
						isResolved = true;
						cleanup();

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
				}),
				quickPick.onDidTriggerButton((button) => {
					if (isResolved) return;

					isResolved = true;
					cleanup();

					if (button.tooltip === "Back") {
						resolve("back");
					} else {
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
										password: db.value === "mssql" ? "Root1234!" : "root",
										useAlpine: false,
										image: db.versions[0].image,
										alpineImage: db.versions[0].alpineImage,
										volumePath: this.getVolumePath(db.value),
									});
								}
							}
						}
						resolve(this.databases);
					}
				}),
				quickPick.onDidHide(() => {
					if (!isResolved) {
						isResolved = true;
						cleanup();
						resolve("cancel");
					}
				}),
			);

			quickPick.show();
		});
	}

	private getVolumePath(dbType: string): string {
		const volumePaths: Record<string, string> = {
			postgresql: "/var/lib/postgresql/data",
			timescaledb: "/var/lib/postgresql/data",
			mysql: "/var/lib/mysql",
			mariadb: "/var/lib/mysql",
			mongodb: "/data/db",
			redis: "/data",
			neo4j: "/data",
			elasticsearch: "/usr/share/elasticsearch/data",
			cassandra: "/var/lib/cassandra",
			influxdb: "/var/lib/influxdb",
			couchdb: "/opt/couchdb/data",
			keycloak: "/opt/jboss/keycloak/standalone/data",
			mssql: "/var/opt/mssql",
			oracle: "/opt/oracle/oradata",
			arangodb: "/var/lib/arangodb3",
			qdrant: "/qdrant/storage",
			weaviate: "/var/lib/weaviate",
			milvus: "/var/lib/milvus",
			chroma: "/chroma/data",
			cockroachdb: "/cockroach/cockroach-data",
			yugabytedb: "/home/yugabyte/data",
			scylladb: "/var/lib/scylla",
			memcached: "/data",
			etcd: "/etcd-data",
			aerospike: "/opt/aerospike/data",
			hbase: "/data",
			bigtable: "/data",
			janusgraph: "/var/lib/janusgraph",
			dgraph: "/dgraph",
			prometheus: "/prometheus",
			opentsdb: "/data",
			solr: "/var/solr",
			meilisearch: "/meili_data",
			typesense: "/data",
			tidb: "/data",
			ravendb: "/opt/RavenDB/Server/RavenData",
			couchbase: "/opt/couchbase/var",
			dynamodb: "/home/dynamodblocal/data",
			db2: "/database",
		};
		return volumePaths[dbType] || `/var/lib/${dbType}`;
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
				password: db.value === "mssql" ? "Root1234!" : "root",
				useAlpine: false,
				image: defaultVersion.image,
				alpineImage: defaultVersion.alpineImage,
				volumePath: this.getVolumePath(db.value),
			};
		}

		if (configMethod.value === "url") {
			const url = await this.showInputBoxWithBack(`Enter ${db.label} connection URL`, "postgresql://user:pass@host:port/dbname", currentStep, totalSteps);

			if (url === "back") return "back";
			if (url === "cancel") return "cancel";
			if (!url) return undefined;

			if (!this.validateUrl(url)) {
				vscode.window.showErrorMessage("Invalid URL format. Please use format: protocol://user:pass@host:port/dbname");
				return undefined;
			}

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

		const internalPortValidation = validatePort(internalPort);
		if (internalPortValidation) {
			vscode.window.showErrorMessage(internalPortValidation);
			return undefined;
		}

		// External port
		const externalPort = await this.showInputBoxWithBack(`Enter ${db.label} External Port`, internalPort, currentStep, totalSteps);
		if (externalPort === "back") return "back";
		if (externalPort === "cancel") return "cancel";
		if (!externalPort) return undefined;

		const externalPortValidation = validatePort(externalPort);
		if (externalPortValidation) {
			vscode.window.showErrorMessage(externalPortValidation);
			return undefined;
		}

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
		const password = await this.showInputBoxWithBack(`Enter Password for ${db.label}`, db.value === "mssql" ? "Root1234!" : "root", currentStep, totalSteps, true);
		if (password === "back") return "back";
		if (password === "cancel") return "cancel";
		if (!password) return undefined;

		if (db.value === "mssql") {
			const passwordValidation = this.validateMssqlPassword(password);
			if (passwordValidation) {
				vscode.window.showErrorMessage(passwordValidation);
				return undefined;
			}
		}

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
			password: password,
			useAlpine: useAlpine?.value === "yes",
			image: version.image,
			alpineImage: version.alpineImage,
			volumePath: this.getVolumePath(db.value),
		};
	}

	private validateUrl(url: string): boolean {
		const urlPattern = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s]+$/;
		return urlPattern.test(url);
	}

	private validateMssqlPassword(password: string): string | null {
		if (password.length < 8) {
			return "MSSQL password must be at least 8 characters long";
		}
		if (!/[A-Z]/.test(password)) {
			return "MSSQL password must contain at least one uppercase letter";
		}
		if (!/[a-z]/.test(password)) {
			return "MSSQL password must contain at least one lowercase letter";
		}
		if (!/[0-9]/.test(password)) {
			return "MSSQL password must contain at least one number";
		}
		if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
			return "MSSQL password must contain at least one special character";
		}
		return null;
	}

	private showQuickPickWithBack(title: string, items: any[], currentStep: number, totalSteps: number): Promise<any> {
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: ${title}`;
		quickPick.items = items;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.buttons = [{ iconPath: new vscode.ThemeIcon("arrow-left"), tooltip: "Back" }];

		let isResolved = false;
		const disposables: vscode.Disposable[] = [];

		return new Promise((resolve) => {
			const cleanup = () => {
				disposables.forEach((d) => d.dispose());
				quickPick.dispose();
			};

			disposables.push(
				quickPick.onDidAccept(() => {
					if (!isResolved) {
						isResolved = true;
						const selected = quickPick.selectedItems[0];
						cleanup();
						resolve(selected);
					}
				}),
				quickPick.onDidTriggerButton((button) => {
					if (!isResolved) {
						isResolved = true;
						cleanup();
						resolve("back");
					}
				}),
				quickPick.onDidHide(() => {
					if (!isResolved) {
						isResolved = true;
						cleanup();
						resolve("cancel");
					}
				}),
			);

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
		const disposables: vscode.Disposable[] = [];

		return new Promise((resolve) => {
			const cleanup = () => {
				disposables.forEach((d) => d.dispose());
				inputBox.dispose();
			};

			const acceptValue = () => {
				if (!isResolved) {
					isResolved = true;
					const value = inputBox.value;
					cleanup();
					resolve(value);
				}
			};

			disposables.push(
				inputBox.onDidAccept(acceptValue),
				inputBox.onDidTriggerButton((button) => {
					if (!isResolved) {
						if (button.tooltip === "Back") {
							isResolved = true;
							cleanup();
							resolve("back");
						} else if (button.tooltip === "OK") {
							acceptValue();
						}
					}
				}),
				inputBox.onDidHide(() => {
					if (!isResolved) {
						isResolved = true;
						cleanup();
						resolve("cancel");
					}
				}),
			);

			inputBox.show();
		});
	}
}
