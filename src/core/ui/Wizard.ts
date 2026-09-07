import * as vscode from "vscode";
import type { ProjectAnalysis, DockerConfig, UserPreferences } from "../../types/interfaces.js";
import { DatabaseType } from "../../types/interfaces.js";
import { ConfigManager } from "../config/ConfigManager.js";

/**
 * Interactive wizard for Docker configuration
 */
export class Wizard {
	private configManager: ConfigManager;
	private analysis: ProjectAnalysis;
	private preferences: UserPreferences;

	constructor(analysis: ProjectAnalysis) {
		this.configManager = ConfigManager.getInstance();
		this.analysis = analysis;
		this.preferences = this.configManager.getPreferences();
	}

	/**
	 * Run the wizard
	 */
	public async run(): Promise<DockerConfig | undefined> {
		// Step 1: Show welcome screen
		const start = await this.showWelcome();
		if (!start) {
			return undefined;
		}

		// Step 2: Show analysis results
		const continueWithAnalysis = await this.showAnalysisResults();
		if (!continueWithAnalysis) {
			return undefined;
		}

		// Step 3: Configure JDK (این فقط یک بار میپرسه)
		const jdkConfig = await this.configureJdk();
		if (!jdkConfig) {
			return undefined;
		}

		// Step 4: Configure port (این فقط یک بار میپرسه)
		const port = await this.configurePort();
		if (!port) {
			return undefined;
		}

		// Step 5: Configure JVM options
		const jvmOptions = await this.configureJvmOptions();
		if (!jvmOptions) {
			return undefined;
		}

		// Step 6: Configure debug mode
		const debugConfig = await this.configureDebug();
		if (!debugConfig) {
			return undefined;
		}

		// Step 7: Configure database
		const dbConfig = await this.configureDatabase();
		if (!dbConfig) {
			return undefined;
		}

		// Step 8: Configure advanced options
		const advancedConfig = await this.configureAdvanced();
		if (!advancedConfig) {
			return undefined;
		}

		// Step 9: Show summary
		const summary = await this.showSummary({
			...jdkConfig,
			...port,
			...jvmOptions,
			...debugConfig,
			...dbConfig,
			...advancedConfig,
		});

		if (!summary) {
			return undefined;
		}

		return summary;
	}

	/**
	 * Show welcome screen
	 */
	private async showWelcome(): Promise<boolean> {
		const choice = await vscode.window.showQuickPick(
			[
				{ label: "$(list-ordered) Start Wizard", description: "Step-by-step configuration" },
				{ label: "$(zap) Quick Generate", description: "Use defaults from VS Code settings" },
				{ label: "$(x) Cancel", description: "Cancel the wizard" },
			],
			{
				placeHolder: "Welcome to Dockeryzen! Choose an option to start:",
				title: "Dockeryzen - Docker Configuration Wizard",
			},
		);

		if (!choice || choice.label.includes("Cancel")) {
			return false;
		}

		if (choice.label.includes("Quick Generate")) {
			vscode.commands.executeCommand("dockeryzen.quick-generate");
			return false;
		}

		return true;
	}

	/**
	 * Show analysis results
	 */
	private async showAnalysisResults(): Promise<boolean> {
		const details = [`Project Type: ${this.analysis.projectType}`, `Build Tool: ${this.analysis.buildTool}`, `Framework: ${this.analysis.framework}`, `JDK Version: ${this.analysis.jdkVersion}`, `Application Port: ${this.analysis.port}`, `Output Type: ${this.analysis.outputType}`];

		if (this.analysis.database) {
			details.push(`Database: ${this.analysis.database.type} (v${this.analysis.database.version})`);
		}

		const choice = await vscode.window.showQuickPick(
			[
				{ label: "$(check) Continue", description: "Proceed with detected settings" },
				{ label: "$(x) Cancel", description: "Cancel the wizard" },
			],
			{
				placeHolder: `Project analysis completed:\n${details.join("\n")}`,
				title: "Dockeryzen - Project Analysis",
			},
		);

		return choice !== undefined && !choice.label.includes("Cancel");
	}

	/**
	 * Edit detected settings
	 */
	private async editDetectedSettings(): Promise<boolean> {
		const portInput = await vscode.window.showInputBox({
			prompt: "Enter application port:",
			value: this.analysis.port?.toString() || "8080",
			validateInput: (value) => {
				const port = parseInt(value);
				if (isNaN(port) || port < 1 || port > 65535) {
					return "Please enter a valid port number (1-65535)";
				}
				return null;
			},
		});

		if (portInput) {
			this.analysis.port = parseInt(portInput);
		}

		const jdkVersionInput = await vscode.window.showInputBox({
			prompt: "Enter JDK version:",
			value: this.analysis.jdkVersion || "17",
			validateInput: (value) => {
				if (!/^\d+$/.test(value)) {
					return "Please enter a valid JDK version (e.g., 17, 21, 25)";
				}
				return null;
			},
		});

		if (jdkVersionInput) {
			this.analysis.jdkVersion = jdkVersionInput;
		}

		const outputTypeChoice = await vscode.window.showQuickPick(
			[
				{ label: "JAR", description: "Executable JAR file" },
				{ label: "WAR", description: "Web application archive" },
				{ label: "Native", description: "GraalVM native image" },
			],
			{
				placeHolder: "Select output type:",
				title: "Dockeryzen - Edit Output Type",
			},
		);

		if (outputTypeChoice) {
			this.analysis.outputType = outputTypeChoice.label.toLowerCase() as any;
		}

		const dbChoice = await vscode.window.showQuickPick(
			[
				{ label: "$(database) PostgreSQL", description: "Recommended" },
				{ label: "$(database) MySQL", description: "Popular" },
				{ label: "$(database) MariaDB", description: "MySQL fork" },
				{ label: "$(database) MongoDB", description: "NoSQL" },
				{ label: "$(database) Redis", description: "Cache" },
				{ label: "$(database) Cassandra", description: "Distributed" },
				{ label: "$(database) Elasticsearch", description: "Search" },
				{ label: "$(database) Neo4j", description: "Graph" },
				{ label: "$(circle-slash) None", description: "No database" },
			],
			{
				placeHolder: "Select database type:",
				title: "Dockeryzen - Edit Database",
			},
		);

		if (dbChoice && !dbChoice.label.includes("None")) {
			const dbName = await vscode.window.showInputBox({
				prompt: "Enter database name:",
				value: this.analysis.database?.name || "appdb",
			});

			const dbUser = await vscode.window.showInputBox({
				prompt: "Enter database username:",
				value: this.analysis.database?.username || "admin",
			});

			const dbPass = await vscode.window.showInputBox({
				prompt: "Enter database password:",
				value: this.analysis.database?.password || "password",
				password: true,
			});

			if (dbName && dbUser && dbPass) {
				this.analysis.database = {
					type: dbChoice.label.split(" ")[1].toLowerCase() as any,
					version: "latest",
					port: 5432,
					name: dbName,
					username: dbUser,
					password: dbPass,
				};
			}
		} else if (dbChoice && dbChoice.label.includes("None")) {
			this.analysis.database = undefined;
		}

		return true;
	}

	/**
	 * Configure JDK
	 */
	private async configureJdk(): Promise<Partial<DockerConfig> | undefined> {
		const jdkImages = [
			{ label: "Eclipse Temurin", description: "Recommended - Open source, production-ready", detail: "eclipse-temurin" },
			{ label: "Amazon Corretto", description: "AWS optimized, free", detail: "amazon-corretto" },
			{ label: "OpenJDK", description: "Official open-source implementation", detail: "openjdk" },
			{ label: "Oracle JDK", description: "Official Oracle, requires license", detail: "oracle-jdk" },
			{ label: "GraalVM", description: "Native image support", detail: "graalvm" },
			{ label: "Liberica JDK", description: "BellSoft, full-featured", detail: "liberica" },
			{ label: "Red Hat OpenJDK", description: "Enterprise support", detail: "redhat-openjdk" },
		];

		const choice = await vscode.window.showQuickPick(jdkImages, {
			placeHolder: "Select JDK base image:",
			title: "Dockeryzen - JDK Configuration",
		});

		if (!choice) {
			return undefined;
		}

		this.preferences.jdkImage = choice.detail as any;
		return { baseImage: choice.detail };
	}

	/**
	 * Configure port
	 */
	private async configurePort(): Promise<Partial<DockerConfig> | undefined> {
		const currentPort = this.analysis.port || 8080;

		const portInput = await vscode.window.showInputBox({
			prompt: "Enter application port:",
			value: currentPort.toString(),
			validateInput: (value) => {
				const port = parseInt(value);
				if (isNaN(port) || port < 1 || port > 65535) {
					return "Please enter a valid port number (1-65535)";
				}
				return null;
			},
		});

		if (!portInput) {
			return undefined;
		}

		const port = parseInt(portInput);
		this.preferences.port = port;
		return { port };
	}

	/**
	 * Configure JVM options
	 */
	private async configureJvmOptions(): Promise<Partial<DockerConfig> | undefined> {
		const jvmOptions = await vscode.window.showInputBox({
			prompt: "Enter JVM options:",
			value: this.preferences.jvmOptions,
			placeHolder: "-Xmx512m -Xms256m -XX:+UseG1GC",
		});

		if (!jvmOptions) {
			return undefined;
		}

		this.preferences.jvmOptions = jvmOptions;
		return { jvmOptions };
	}

	/**
	 * Configure debug mode
	 */
	private async configureDebug(): Promise<Partial<DockerConfig> | undefined> {
		const choice = await vscode.window.showQuickPick(
			[
				{ label: "$(circle-slash) Disable Debug", description: "No debug support" },
				{ label: "$(bug) Enable Debug", description: "Enable debug on port 5005" },
			],
			{
				placeHolder: "Configure debug mode:",
				title: "Dockeryzen - Debug Configuration",
			},
		);

		if (!choice) {
			return undefined;
		}

		const enableDebug = choice.label.includes("Enable");
		this.preferences.enableDebug = enableDebug;

		return {
			enableDebug,
			debugPort: enableDebug ? 5005 : undefined,
		};
	}

	/**
	 * Configure database
	 */
	private async configureDatabase(): Promise<Partial<DockerConfig> | undefined> {
		if (!this.analysis.database) {
			const addDb = await vscode.window.showQuickPick(
				[
					{ label: "$(database) Add Database", description: "Add a database service to docker-compose" },
					{ label: "$(circle-slash) Skip", description: "No database needed" },
				],
				{
					placeHolder: "Database configuration:",
					title: "Dockeryzen - Database Configuration",
				},
			);

			if (!addDb || addDb.label.includes("Skip")) {
				return {};
			}
		}

		const dbTypes = [
			{ label: "PostgreSQL", description: "Recommended - Powerful, open-source", detail: "postgresql" },
			{ label: "MySQL", description: "Popular, widely used", detail: "mysql" },
			{ label: "MariaDB", description: "MySQL fork, fully compatible", detail: "mariadb" },
			{ label: "MongoDB", description: "NoSQL document database", detail: "mongodb" },
			{ label: "Redis", description: "In-memory cache", detail: "redis" },
			{ label: "Cassandra", description: "Distributed NoSQL", detail: "cassandra" },
			{ label: "Elasticsearch", description: "Search and analytics", detail: "elasticsearch" },
			{ label: "Neo4j", description: "Graph database", detail: "neo4j" },
		];

		const dbTypeChoice = await vscode.window.showQuickPick(dbTypes, {
			placeHolder: "Select database type:",
			title: "Dockeryzen - Database Type",
		});

		if (!dbTypeChoice) {
			return undefined;
		}

		const dbName = await vscode.window.showInputBox({
			prompt: "Enter database name:",
			value: this.analysis.database?.name || "appdb",
		});

		if (!dbName) {
			return undefined;
		}

		const dbUsername = await vscode.window.showInputBox({
			prompt: "Enter database username:",
			value: this.analysis.database?.username || "admin",
		});

		if (!dbUsername) {
			return undefined;
		}

		const dbPassword = await vscode.window.showInputBox({
			prompt: "Enter database password:",
			value: this.analysis.database?.password || "password",
			password: true,
		});

		if (!dbPassword) {
			return undefined;
		}

		const dbVersionChoices = this.getDatabaseVersions(dbTypeChoice.detail as DatabaseType);
		const dbVersion = await vscode.window.showQuickPick(dbVersionChoices, {
			placeHolder: "Select database version:",
			title: "Dockeryzen - Database Version",
		});

		if (!dbVersion) {
			return undefined;
		}

		return {
			database: {
				type: dbTypeChoice.detail as DatabaseType,
				version: dbVersion.label,
				port: this.getDefaultDbPort(dbTypeChoice.detail as DatabaseType),
				name: dbName,
				username: dbUsername,
				password: dbPassword,
			},
		};
	}

	/**
	 * Configure advanced options
	 */
	private async configureAdvanced(): Promise<Partial<DockerConfig> | undefined> {
		const options = await vscode.window.showQuickPick(
			[
				{ label: "$(check) Enable Health Check", description: "Add health check to Dockerfile", picked: true },
				{ label: "$(check) Use Alpine", description: "Use Alpine base image for smaller size", picked: true },
				{ label: "$(circle-slash) No Resource Limits", description: "Skip resource limits configuration" },
			],
			{
				placeHolder: "Advanced configuration:",
				title: "Dockeryzen - Advanced Options",
				canPickMany: true,
			},
		);

		if (!options || options.length === 0) {
			return undefined;
		}

		const enableHealthCheck = options.some((o) => o.label.includes("Health Check"));
		const useAlpine = options.some((o) => o.label.includes("Alpine"));

		this.preferences.enableHealthCheck = enableHealthCheck;
		this.preferences.imageOptimization = useAlpine ? "alpine" : "slim";

		let jvmOptions = this.preferences.jvmOptions;
		if (useAlpine) {
			if (!jvmOptions.includes("alpine")) {
				jvmOptions = jvmOptions ? `${jvmOptions} alpine` : "alpine";
			}
		}

		return {
			enableHealthCheck,
			healthCheckEndpoint: "/actuator/health",
			jvmOptions: jvmOptions,
		};
	}

	/**
	 * Show summary
	 */
	private async showSummary(config: Partial<DockerConfig>): Promise<DockerConfig | undefined> {
		const summary = [
			`Base Image: ${config.baseImage || "eclipse-temurin"}`,
			`Port: ${config.port || this.analysis.port || 8080}`,
			`JVM Options: ${config.jvmOptions || this.preferences.jvmOptions}`,
			`Debug: ${config.enableDebug ? "Enabled" : "Disabled"}`,
			`Health Check: ${config.enableHealthCheck ? "Enabled" : "Disabled"}`,
			`Database: ${config.database ? config.database.type : "None"}`,
		];

		const choice = await vscode.window.showQuickPick(
			[
				{ label: "$(check) Generate", description: "Generate Docker files with these settings" },
				{ label: "$(arrow-left) Back", description: "Go back and modify settings" },
				{ label: "$(x) Cancel", description: "Cancel generation" },
			],
			{
				placeHolder: `Configuration summary:\n${summary.join("\n")}`,
				title: "Dockeryzen - Summary",
			},
		);

		if (!choice || choice.label.includes("Cancel")) {
			return undefined;
		}

		if (choice.label.includes("Back")) {
			return this.run();
		}

		return {
			baseImage: config.baseImage || this.preferences.jdkImage,
			jdkVersion: this.analysis.jdkVersion,
			port: config.port || this.analysis.port || 8080,
			jvmOptions: config.jvmOptions || this.preferences.jvmOptions,
			enableDebug: config.enableDebug || false,
			debugPort: config.debugPort || 5005,
			enableHealthCheck: config.enableHealthCheck ?? true,
			healthCheckEndpoint: config.healthCheckEndpoint || "/actuator/health",
			outputType: this.analysis.outputType,
			database: config.database || this.analysis.database,
			envVariables: this.analysis.envVariables,
			composeServices: [],
			volumes: [],
			networks: [],
		};
	}

	/**
	 * Get database versions
	 */
	private getDatabaseVersions(dbType: DatabaseType): vscode.QuickPickItem[] {
		const versions: Record<DatabaseType, string[]> = {
			[DatabaseType.POSTGRESQL]: ["16", "15", "14", "13", "12"],
			[DatabaseType.MYSQL]: ["8.4", "8.0", "5.7"],
			[DatabaseType.MARIADB]: ["11", "10.11", "10.6"],
			[DatabaseType.MONGODB]: ["7", "6", "5", "4.4"],
			[DatabaseType.REDIS]: ["7", "6", "5"],
			[DatabaseType.CASSANDRA]: ["5", "4.1", "4.0"],
			[DatabaseType.ELASTICSEARCH]: ["8", "7"],
			[DatabaseType.NEO4J]: ["5", "4.4"],
			[DatabaseType.H2]: ["latest"],
			[DatabaseType.NONE]: ["latest"],
		};

		const dbVersions = versions[dbType] || ["latest"];
		return dbVersions.map((v) => ({ label: v }));
	}

	/**
	 * Get default database port
	 */
	private getDefaultDbPort(dbType: DatabaseType): number {
		const ports: Record<DatabaseType, number> = {
			[DatabaseType.POSTGRESQL]: 5432,
			[DatabaseType.MYSQL]: 3306,
			[DatabaseType.MARIADB]: 3306,
			[DatabaseType.MONGODB]: 27017,
			[DatabaseType.REDIS]: 6379,
			[DatabaseType.CASSANDRA]: 9042,
			[DatabaseType.ELASTICSEARCH]: 9200,
			[DatabaseType.NEO4J]: 7687,
			[DatabaseType.H2]: 9092,
			[DatabaseType.NONE]: 0,
		};

		return ports[dbType] || 5432;
	}
}
