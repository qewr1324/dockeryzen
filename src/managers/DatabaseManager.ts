import * as vscode from "vscode";
import { DatabaseConfig } from "../types/index.js";

export class DatabaseManager {
	private databases: DatabaseConfig[] = [];

	async selectDatabases(): Promise<DatabaseConfig[]> {
		const allDatabases = this.getDatabaseDefinitions();

		const selected = await vscode.window.showQuickPick(
			allDatabases.map((db) => ({
				label: `$(database) ${db.label}`,
				description: db.category,
				detail: `Default port: ${db.defaultPort}`,
				value: db.value,
				defaultPort: db.defaultPort,
				defaultUser: db.defaultUser,
				defaultDatabase: db.defaultDatabase,
				versions: db.versions,
				picked: false,
			})),
			{
				placeHolder: "Select databases (multi-select)",
				canPickMany: true,
				matchOnDescription: true,
				matchOnDetail: true,
			},
		);

		if (!selected || selected.length === 0) {
			return [];
		}

		for (const db of selected) {
			const config = await this.askDatabaseConfig(db);
			if (config) {
				this.databases.push(config);
			}
		}

		return this.databases;
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
				versions: ["11.2", "11.1", "10.11"],
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
				label: "DynamoDB",
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
				label: "Bigtable",
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
				category: "Time Series",
				versions: ["2.7", "2.6", "2.5"],
			},
			{
				label: "TimescaleDB",
				value: "timescaledb",
				defaultPort: 5432,
				defaultUser: "postgres",
				defaultDatabase: "postgres",
				category: "Time Series",
				versions: ["2.13", "2.12", "2.11"],
			},
			{
				label: "Prometheus",
				value: "prometheus",
				defaultPort: 9090,
				defaultUser: "root",
				category: "Time Series",
				versions: ["2.48", "2.47", "2.46"],
			},
			{
				label: "OpenTSDB",
				value: "opentsdb",
				defaultPort: 4242,
				defaultUser: "root",
				category: "Time Series",
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
				category: "NewSQL",
				versions: ["23.2", "23.1", "22.2"],
			},
			{
				label: "TiDB",
				value: "tidb",
				defaultPort: 4000,
				defaultUser: "root",
				category: "NewSQL",
				versions: ["7.5", "7.4", "7.3"],
			},
			{
				label: "YugabyteDB",
				value: "yugabytedb",
				defaultPort: 5433,
				defaultUser: "yugabyte",
				defaultDatabase: "yugabyte",
				category: "NewSQL",
				versions: ["2.20", "2.19", "2.18"],
			},
			// Vector Databases
			{
				label: "Pinecone",
				value: "pinecone",
				defaultPort: 433,
				defaultUser: "root",
				category: "Vector Database",
				versions: ["latest"],
			},
			{
				label: "Weaviate",
				value: "weaviate",
				defaultPort: 8080,
				defaultUser: "root",
				category: "Vector Database",
				versions: ["1.23", "1.22", "1.21"],
			},
			{
				label: "Qdrant",
				value: "qdrant",
				defaultPort: 6333,
				defaultUser: "root",
				category: "Vector Database",
				versions: ["1.7", "1.6", "1.5"],
			},
			{
				label: "Milvus",
				value: "milvus",
				defaultPort: 19530,
				defaultUser: "root",
				category: "Vector Database",
				versions: ["2.3", "2.2", "2.1"],
			},
			{
				label: "Chroma",
				value: "chroma",
				defaultPort: 8000,
				defaultUser: "root",
				category: "Vector Database",
				versions: ["0.4", "0.3", "0.2"],
			},
		];
	}

	private async askDatabaseConfig(db: any): Promise<DatabaseConfig | undefined> {
		// Ask for configuration method
		const configMethod = await vscode.window.showQuickPick(
			[
				{ label: "$(settings-gear) Edit Part", description: "Configure individual settings", value: "part" },
				{ label: "$(link) Edit URL", description: "Use external URL", value: "url" },
			],
			{
				placeHolder: `How to configure ${db.label}?`,
			},
		);

		if (!configMethod) return undefined;

		if (configMethod.value === "url") {
			const url = await vscode.window.showInputBox({
				prompt: `Enter ${db.label} connection URL`,
				placeHolder: "e.g., postgresql://user:pass@host:port/dbname",
			});

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

		// Version selection
		const version = await vscode.window.showQuickPick(
			db.versions.map((v: string) => ({ label: `$(tag) ${v}`, value: v })),
			{ placeHolder: `Select ${db.label} version` },
		);

		if (!version) return undefined;

		// Internal port
		const internalPort = await vscode.window.showInputBox({
			prompt: `Enter ${db.label} internal port`,
			value: db.defaultPort.toString(),
			validateInput: (value) => {
				const portNum = parseInt(value);
				if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
					return "Please enter a valid port number (1-65535)";
				}
				return null;
			},
		});

		if (!internalPort) return undefined;

		// External port
		const externalPort = await vscode.window.showInputBox({
			prompt: `Enter ${db.label} external port`,
			value: internalPort,
			validateInput: (value) => {
				const portNum = parseInt(value);
				if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
					return "Please enter a valid port number (1-65535)";
				}
				return null;
			},
		});

		if (!externalPort) return undefined;

		// Database name
		let databaseName: string | undefined;
		if (db.defaultDatabase) {
			databaseName = await vscode.window.showInputBox({
				prompt: `Enter database name for ${db.label}`,
				value: db.defaultDatabase,
			});
		}

		// Username
		const username = await vscode.window.showInputBox({
			prompt: `Enter username for ${db.label}`,
			value: db.defaultUser,
		});

		if (!username) return undefined;

		// Password
		const password = await vscode.window.showInputBox({
			prompt: `Enter password for ${db.label}`,
			value: "root",
			password: true,
		});

		// Alpine option
		const useAlpine = await vscode.window.showQuickPick(
			[
				{ label: "$(check) Yes", description: "Use Alpine-based image", value: "yes" },
				{ label: "$(x) No", description: "Use standard image", value: "no" },
			],
			{ placeHolder: "Use Alpine version?" },
		);

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
}
