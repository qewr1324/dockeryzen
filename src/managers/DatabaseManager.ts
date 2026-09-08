import * as vscode from "vscode";
import { DatabaseConfig } from "../types/index.js";

export class DatabaseManager {
	private databases: DatabaseConfig[] = [];

	async selectDatabases(currentStep: number, totalSteps: number): Promise<DatabaseConfig[] | "back" | "cancel"> {
		const allDatabases = this.getDatabaseDefinitions();

		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: Select Databases`;
		quickPick.placeholder = "Select databases (multi-select) - Press Enter when done";
		quickPick.items = allDatabases.map((db) => ({
			label: `$(database) ${db.label}`,
			description: db.category,
			detail: `Port: ${db.defaultPort} | Version: ${db.versions[0]} | User: ${db.defaultUser}`,
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

	private async showSelectedDatabasesWithEdit(selectedDbs: any[], currentStep: number, totalSteps: number): Promise<DatabaseConfig[] | "back" | "cancel"> {
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = `Step ${currentStep + 1}/${totalSteps}: Configure Databases`;
		quickPick.placeholder = "Click on a database to edit it, or press Enter to continue with defaults";
		quickPick.items = selectedDbs.map((db) => ({
			label: `$(database) ${db.label}`,
			description: db.configured ? "$(check) Configured" : "$(gear) Click to Edit",
			detail: `Port: ${db.defaultPort} | Version: ${db.versions[0]} | User: ${db.defaultUser}`,
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
						this.databases.push(config);
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
							this.databases.push({
								type: db.value,
								version: db.versions[0],
								internalPort: db.defaultPort,
								externalPort: db.defaultPort,
								databaseName: db.defaultDatabase,
								username: db.defaultUser,
								password: "root",
								useAlpine: false,
							});
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
			return {
				type: db.value,
				version: db.versions[0],
				internalPort: db.defaultPort,
				externalPort: db.defaultPort,
				databaseName: db.defaultDatabase,
				username: db.defaultUser,
				password: "root",
				useAlpine: false,
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
		const version = await this.showQuickPickWithBack(
			`Select ${db.label} Version`,
			db.versions.map((v: string) => ({
				label: `$(tag) ${v}`,
				description: `${db.label} version ${v}`,
				detail: `Docker image tag: ${v}`,
				value: v,
			})),
			currentStep,
			totalSteps,
		);
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
				{ label: "$(check) Yes", description: "Alpine-based image", detail: "Smaller image size (~50% smaller)", value: "yes" },
				{ label: "$(x) No", description: "Standard image", detail: "Full-featured image with all dependencies", value: "no" },
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

	private getDatabaseDefinitions() {
		return [
			// SQL Databases
			{
				label: "PostgreSQL",
				value: "postgresql",
				defaultPort: 5432,
				defaultUser: "postgres",
				defaultDatabase: "postgres",
				category: "SQL Database",
				versions: ["16", "15", "14", "13", "12"],
			},
			{
				label: "MySQL",
				value: "mysql",
				defaultPort: 3306,
				defaultUser: "root",
				defaultDatabase: "mysql",
				category: "SQL Database",
				versions: ["8.0", "5.7", "5.6"],
			},
			{
				label: "MariaDB",
				value: "mariadb",
				defaultPort: 3306,
				defaultUser: "root",
				defaultDatabase: "mysql",
				category: "SQL Database",
				versions: ["11.2", "11.1", "10.11", "10.6"],
			},
			{
				label: "Oracle",
				value: "oracle",
				defaultPort: 1521,
				defaultUser: "system",
				defaultDatabase: "ORCL",
				category: "SQL Database",
				versions: ["21", "19", "18"],
			},
			{
				label: "MSSQL",
				value: "mssql",
				defaultPort: 1433,
				defaultUser: "sa",
				defaultDatabase: "master",
				category: "SQL Database",
				versions: ["2022", "2019", "2017"],
			},
			{
				label: "IBM Db2",
				value: "db2",
				defaultPort: 50000,
				defaultUser: "db2inst1",
				defaultDatabase: "sample",
				category: "SQL Database",
				versions: ["11.5", "11.1", "10.5"],
			},
			// NoSQL Databases
			{
				label: "MongoDB",
				value: "mongodb",
				defaultPort: 27017,
				defaultUser: "root",
				category: "NoSQL Database",
				versions: ["7.0", "6.0", "5.0", "4.4"],
			},
			{
				label: "CouchDB",
				value: "couchdb",
				defaultPort: 5984,
				defaultUser: "admin",
				category: "NoSQL Database",
				versions: ["3.3", "3.2", "3.1"],
			},
			{
				label: "Couchbase",
				value: "couchbase",
				defaultPort: 8091,
				defaultUser: "admin",
				category: "NoSQL Database",
				versions: ["7.2", "7.1", "7.0"],
			},
			{
				label: "Amazon DynamoDB",
				value: "dynamodb",
				defaultPort: 8000,
				defaultUser: "root",
				category: "NoSQL Database",
				versions: ["latest"],
			},
			{
				label: "RavenDB",
				value: "ravendb",
				defaultPort: 8080,
				defaultUser: "root",
				category: "NoSQL Database",
				versions: ["6.0", "5.4", "5.2"],
			},
			// Key-Value Stores
			{
				label: "Redis",
				value: "redis",
				defaultPort: 6379,
				defaultUser: "default",
				category: "Key-Value Store",
				versions: ["7.2", "7.0", "6.2"],
			},
			{
				label: "Memcached",
				value: "memcached",
				defaultPort: 11211,
				defaultUser: "root",
				category: "Key-Value Store",
				versions: ["1.6", "1.5"],
			},
			{
				label: "etcd",
				value: "etcd",
				defaultPort: 2379,
				defaultUser: "root",
				category: "Key-Value Store",
				versions: ["3.5", "3.4", "3.3"],
			},
			{
				label: "Aerospike",
				value: "aerospike",
				defaultPort: 3000,
				defaultUser: "root",
				category: "Key-Value Store",
				versions: ["7.0", "6.4", "6.3"],
			},
			// Wide-Column Stores
			{
				label: "Cassandra",
				value: "cassandra",
				defaultPort: 9042,
				defaultUser: "cassandra",
				category: "Wide-Column Store",
				versions: ["4.1", "4.0", "3.11"],
			},
			{
				label: "ScyllaDB",
				value: "scylladb",
				defaultPort: 9042,
				defaultUser: "root",
				category: "Wide-Column Store",
				versions: ["5.4", "5.2", "5.1"],
			},
			{
				label: "HBase",
				value: "hbase",
				defaultPort: 9090,
				defaultUser: "root",
				category: "Wide-Column Store",
				versions: ["2.5", "2.4", "2.3"],
			},
			{
				label: "Google Bigtable",
				value: "bigtable",
				defaultPort: 8080,
				defaultUser: "root",
				category: "Wide-Column Store",
				versions: ["latest"],
			},
			// Graph Databases
			{
				label: "Neo4j",
				value: "neo4j",
				defaultPort: 7474,
				defaultUser: "neo4j",
				defaultDatabase: "neo4j",
				category: "Graph Database",
				versions: ["5.15", "5.14", "4.4"],
			},
			{
				label: "ArangoDB",
				value: "arangodb",
				defaultPort: 8529,
				defaultUser: "root",
				category: "Graph Database",
				versions: ["3.11", "3.10", "3.9"],
			},
			{
				label: "JanusGraph",
				value: "janusgraph",
				defaultPort: 8182,
				defaultUser: "root",
				category: "Graph Database",
				versions: ["0.6", "0.5"],
			},
			{
				label: "Dgraph",
				value: "dgraph",
				defaultPort: 8080,
				defaultUser: "root",
				category: "Graph Database",
				versions: ["23.0", "22.0", "21.12"],
			},
			// Time Series
			{
				label: "InfluxDB",
				value: "influxdb",
				defaultPort: 8086,
				defaultUser: "admin",
				category: "Time Series Database",
				versions: ["2.7", "2.6", "2.5"],
			},
			{
				label: "TimescaleDB",
				value: "timescaledb",
				defaultPort: 5432,
				defaultUser: "postgres",
				defaultDatabase: "postgres",
				category: "Time Series Database",
				versions: ["2.13", "2.12", "2.11"],
			},
			{
				label: "Prometheus",
				value: "prometheus",
				defaultPort: 9090,
				defaultUser: "root",
				category: "Time Series Database",
				versions: ["2.48", "2.47", "2.46"],
			},
			{
				label: "OpenTSDB",
				value: "opentsdb",
				defaultPort: 4242,
				defaultUser: "root",
				category: "Time Series Database",
				versions: ["2.4", "2.3"],
			},
			// Search Engines
			{
				label: "Elasticsearch",
				value: "elasticsearch",
				defaultPort: 9200,
				defaultUser: "elastic",
				category: "Search Engine",
				versions: ["8.11", "8.10", "7.17"],
			},
			{
				label: "Solr",
				value: "solr",
				defaultPort: 8983,
				defaultUser: "solr",
				category: "Search Engine",
				versions: ["9.4", "9.3", "8.11"],
			},
			{
				label: "Meilisearch",
				value: "meilisearch",
				defaultPort: 7700,
				defaultUser: "root",
				category: "Search Engine",
				versions: ["1.4", "1.3", "1.2"],
			},
			{
				label: "Typesense",
				value: "typesense",
				defaultPort: 8108,
				defaultUser: "root",
				category: "Search Engine",
				versions: ["0.25", "0.24", "0.23"],
			},
			// NewSQL
			{
				label: "CockroachDB",
				value: "cockroachdb",
				defaultPort: 26257,
				defaultUser: "root",
				defaultDatabase: "defaultdb",
				category: "NewSQL Database",
				versions: ["23.2", "23.1", "22.2"],
			},
			{
				label: "TiDB",
				value: "tidb",
				defaultPort: 4000,
				defaultUser: "root",
				category: "NewSQL Database",
				versions: ["7.5", "7.4", "7.3"],
			},
			{
				label: "YugabyteDB",
				value: "yugabytedb",
				defaultPort: 5433,
				defaultUser: "yugabyte",
				defaultDatabase: "yugabyte",
				category: "NewSQL Database",
				versions: ["2.20", "2.19", "2.18"],
			},
			// Vector Databases
			{
				label: "Pinecone",
				value: "pinecone",
				defaultPort: 433,
				defaultUser: "root",
				category: "Vector Database (AI/ML)",
				versions: ["latest"],
			},
			{
				label: "Weaviate",
				value: "weaviate",
				defaultPort: 8080,
				defaultUser: "root",
				category: "Vector Database (AI/ML)",
				versions: ["1.23", "1.22", "1.21"],
			},
			{
				label: "Qdrant",
				value: "qdrant",
				defaultPort: 6333,
				defaultUser: "root",
				category: "Vector Database (AI/ML)",
				versions: ["1.7", "1.6", "1.5"],
			},
			{
				label: "Milvus",
				value: "milvus",
				defaultPort: 19530,
				defaultUser: "root",
				category: "Vector Database (AI/ML)",
				versions: ["2.3", "2.2", "2.1"],
			},
			{
				label: "Chroma",
				value: "chroma",
				defaultPort: 8000,
				defaultUser: "root",
				category: "Vector Database (AI/ML)",
				versions: ["0.4", "0.3", "0.2"],
			},
		];
	}
}
