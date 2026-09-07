import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import type { ProjectAnalysis, DatabaseConfig, Dependency, ConfigFile } from "../../types/interfaces.js";
import { DatabaseType, BuildTool, ProjectType, Framework, JdkVendor, OutputType } from "../../types/interfaces.js";
import { ProjectAnalyzer } from "./ProjectAnalyzer.js";
import { FrameworkDetector } from "./FrameworkDetector.js";

/**
 * Java project analyzer
 */
export class JavaProjectAnalyzer extends ProjectAnalyzer {
	/**
	 * Analyze Java project
	 */
	public async analyze(): Promise<ProjectAnalysis> {
		const buildTool = await this.detectBuildTool();
		const jdkVersion = await this.detectJdkVersion(buildTool);
		const port = await this.detectPort();
		const mainClass = await this.detectMainClass();
		const structure = await this.analyzeStructure();

		const frameworkDetector = new FrameworkDetector(this.workspaceFolder);
		const framework = await frameworkDetector.detect();

		const dependencies = await this.extractDependencies(buildTool);
		const database = await this.detectDatabase(dependencies, framework);
		const jvmOptions = this.extractJvmOptions();
		const profiles = await this.detectProfiles();
		const envVariables = await this.extractEnvVariables();

		const outputType = this.detectOutputType(framework, dependencies);
		const configFiles = await this.findConfigFiles();

		const jdkVendor = this.detectJdkVendor(dependencies);

		return {
			projectType: buildTool === BuildTool.NONE ? ProjectType.UNKNOWN : (await this.isMultiModule()) ? ProjectType.MULTI_MODULE : buildTool === BuildTool.MAVEN ? ProjectType.MAVEN : ProjectType.GRADLE,
			buildTool,
			framework,
			jdkVersion,
			jdkVendor,
			port,
			database,
			dependencies,
			mainClass,
			outputType,
			configFiles,
			jvmOptions,
			profiles,
			envVariables,
		};
	}

	/**
	 * Extract dependencies from build files
	 */
	protected async extractDependencies(buildTool: BuildTool): Promise<Dependency[]> {
		const dependencies: Dependency[] = [];

		if (buildTool === BuildTool.MAVEN) {
			const pomPath = path.join(this.workspaceFolder.uri.fsPath, "pom.xml");
			if (await fs.pathExists(pomPath)) {
				const content = await fs.readFile(pomPath, "utf8");
				const depRegex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*(?:<version>([^<]+)<\/version>)?/g;
				let match;
				while ((match = depRegex.exec(content)) !== null) {
					dependencies.push({
						groupId: match[1],
						artifactId: match[2],
						version: match[3] || "",
					});
				}
			}
		} else if (buildTool === BuildTool.GRADLE) {
			const gradlePath = path.join(this.workspaceFolder.uri.fsPath, "build.gradle");
			if (await fs.pathExists(gradlePath)) {
				const content = await fs.readFile(gradlePath, "utf8");
				const depRegex = /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*\(?\s*['"]([^'"]+)['"]/g;
				let match;
				while ((match = depRegex.exec(content)) !== null) {
					const parts = match[1].split(":");
					if (parts.length >= 2) {
						dependencies.push({
							groupId: parts[0],
							artifactId: parts[1],
							version: parts[2] || "",
						});
					}
				}
			}
		}

		return dependencies;
	}

	/**
	 * Detect database from dependencies and configuration
	 */
	protected async detectDatabase(dependencies: Dependency[], framework: Framework): Promise<DatabaseConfig | undefined> {
		let dbType: DatabaseType = DatabaseType.NONE;
		let dbVersion = "latest";

		// Check dependencies for database drivers
		for (const dep of dependencies) {
			const artifactId = dep.artifactId.toLowerCase();

			if (artifactId.includes("postgresql") || artifactId.includes("postgres")) {
				dbType = DatabaseType.POSTGRESQL;
				dbVersion = "16";
				break;
			} else if (artifactId.includes("mysql")) {
				dbType = DatabaseType.MYSQL;
				dbVersion = "8.4";
				break;
			} else if (artifactId.includes("mariadb")) {
				dbType = DatabaseType.MARIADB;
				dbVersion = "11";
				break;
			} else if (artifactId.includes("mongodb")) {
				dbType = DatabaseType.MONGODB;
				dbVersion = "7";
				break;
			} else if (artifactId.includes("redis")) {
				dbType = DatabaseType.REDIS;
				dbVersion = "7";
				break;
			} else if (artifactId.includes("h2")) {
				dbType = DatabaseType.H2;
				dbVersion = "latest";
				break;
			} else if (artifactId.includes("cassandra")) {
				dbType = DatabaseType.CASSANDRA;
				dbVersion = "5";
				break;
			} else if (artifactId.includes("elasticsearch")) {
				dbType = DatabaseType.ELASTICSEARCH;
				dbVersion = "8";
				break;
			} else if (artifactId.includes("neo4j")) {
				dbType = DatabaseType.NEO4J;
				dbVersion = "5";
				break;
			}
		}

		// Check configuration files for database settings
		if (dbType !== DatabaseType.NONE) {
			const configFiles = await this.findConfigFiles();
			let dbName = "appdb";
			let dbUsername = "admin";
			let dbPassword = "password";
			let dbPort = this.getDefaultDbPort(dbType);

			for (const configFile of configFiles) {
				if (configFile.type === "properties") {
					const content = await fs.readFile(configFile.path, "utf8");

					const nameMatch = content.match(/spring\.datasource\.url.*?:\/\/(?:localhost|127\.0\.0\.1):\d+\/(\w+)/);
					if (nameMatch) {
						dbName = nameMatch[1];
					}

					const userMatch = content.match(/spring\.datasource\.username\s*=\s*(\w+)/);
					if (userMatch) {
						dbUsername = userMatch[1];
					}

					const passMatch = content.match(/spring\.datasource\.password\s*=\s*(\w+)/);
					if (passMatch) {
						dbPassword = passMatch[1];
					}
				} else if (configFile.type === "yml" || configFile.type === "yaml") {
					const content = await fs.readFile(configFile.path, "utf8");

					const nameMatch = content.match(/url:.*?:\/\/(?:localhost|127\.0\.0\.1):\d+\/(\w+)/);
					if (nameMatch) {
						dbName = nameMatch[1];
					}

					const userMatch = content.match(/username:\s*(\w+)/);
					if (userMatch) {
						dbUsername = userMatch[1];
					}

					const passMatch = content.match(/password:\s*(\w+)/);
					if (passMatch) {
						dbPassword = passMatch[1];
					}
				}
			}

			return {
				type: dbType,
				version: dbVersion,
				port: dbPort,
				name: dbName,
				username: dbUsername,
				password: dbPassword,
			};
		}

		return undefined;
	}

	/**
	 * Get default database port
	 */
	private getDefaultDbPort(dbType: DatabaseType): number {
		switch (dbType) {
			case DatabaseType.POSTGRESQL:
				return 5432;
			case DatabaseType.MYSQL:
				return 3306;
			case DatabaseType.MARIADB:
				return 3306;
			case DatabaseType.MONGODB:
				return 27017;
			case DatabaseType.REDIS:
				return 6379;
			case DatabaseType.CASSANDRA:
				return 9042;
			case DatabaseType.ELASTICSEARCH:
				return 9200;
			case DatabaseType.NEO4J:
				return 7687;
			case DatabaseType.H2:
				return 9092;
			default:
				return 5432;
		}
	}

	/**
	 * Extract JVM options
	 */
	protected extractJvmOptions(): string | undefined {
		const config = vscode.workspace.getConfiguration("dockeryzen");
		return config.get("jvmOptions") || "-Xmx512m -Xms256m";
	}

	/**
	 * Detect Spring profiles
	 */
	protected async detectProfiles(): Promise<string[] | undefined> {
		const profiles: string[] = [];

		const configFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(this.workspaceFolder, "**/application-*.{properties,yml,yaml}"), "**/node_modules/**");

		for (const file of configFiles) {
			const fileName = path.basename(file.fsPath);
			const profileMatch = fileName.match(/application-(.+)\.(?:properties|yml|yaml)/);
			if (profileMatch) {
				profiles.push(profileMatch[1]);
			}
		}

		return profiles.length > 0 ? profiles : undefined;
	}

	/**
	 * Extract environment variables
	 */
	protected async extractEnvVariables(): Promise<Record<string, string>> {
		const envVars: Record<string, string> = {};

		// Check .env file
		const envPath = path.join(this.workspaceFolder.uri.fsPath, ".env");
		if (await fs.pathExists(envPath)) {
			const content = await fs.readFile(envPath, "utf8");
			const lines = content.split("\n");

			for (const line of lines) {
				const match = line.match(/^([A-Z_]+)=(.*)$/);
				if (match) {
					envVars[match[1]] = match[2];
				}
			}
		}

		// Check application.properties for environment variables
		const configFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(this.workspaceFolder, "**/application.properties"), "**/node_modules/**");

		for (const file of configFiles) {
			const content = await fs.readFile(file.fsPath, "utf8");
			const envPattern = /\$\{(\w+):([^}]+)\}/g;
			let match;

			while ((match = envPattern.exec(content)) !== null) {
				if (!envVars[match[1]]) {
					envVars[match[1]] = match[2];
				}
			}
		}

		return envVars;
	}

	/**
	 * Detect output type
	 */
	protected detectOutputType(framework: Framework, dependencies: Dependency[]): OutputType {
		// Check pom.xml for packaging type
		const pomPath = path.join(this.workspaceFolder.uri.fsPath, "pom.xml");
		if (fs.existsSync(pomPath)) {
			const pomContent = fs.readFileSync(pomPath, "utf8");

			// Check for WAR packaging
			if (/<packaging>\s*war\s*<\/packaging>/.test(pomContent)) {
				return OutputType.WAR;
			}

			// Check for native image
			if (/<packaging>\s*native-image\s*<\/packaging>/.test(pomContent)) {
				return OutputType.NATIVE;
			}
		}

		// Check for WAR packaging in build settings
		if (framework === Framework.SPRING_MVC || framework === Framework.JAVA_EE || framework === Framework.JAKARTA_EE) {
			for (const dep of dependencies) {
				if (dep.artifactId.toLowerCase().includes("tomcat") || dep.artifactId.toLowerCase().includes("jetty") || dep.artifactId.toLowerCase().includes("undertow")) {
					return OutputType.WAR;
				}
			}
		}

		// Check for servlet dependencies (indicates WAR)
		for (const dep of dependencies) {
			const artifactId = dep.artifactId.toLowerCase();
			if (artifactId.includes("servlet") || artifactId.includes("jsp") || artifactId.includes("jstl")) {
				return OutputType.WAR;
			}
		}

		// Check for GraalVM native image
		for (const dep of dependencies) {
			if (dep.groupId === "org.graalvm" || dep.artifactId.includes("graalvm")) {
				return OutputType.NATIVE;
			}
		}

		return OutputType.JAR;
	}

	/**
	 * Find configuration files
	 */
	protected async findConfigFiles(): Promise<ConfigFile[]> {
		const configFiles: ConfigFile[] = [];

		const files = await vscode.workspace.findFiles(new vscode.RelativePattern(this.workspaceFolder, "**/application.{properties,yml,yaml}"), "**/node_modules/**");

		for (const file of files) {
			const ext = path.extname(file.fsPath).slice(1) as "properties" | "yml" | "yaml";
			const content = await fs.readFile(file.fsPath, "utf8");

			configFiles.push({
				path: file.fsPath,
				type: ext,
				content: this.parseConfigContent(content, ext),
			});
		}

		return configFiles;
	}

	/**
	 * Parse configuration content
	 */
	private parseConfigContent(content: string, type: "properties" | "yml" | "yaml"): Record<string, any> {
		const result: Record<string, any> = {};

		if (type === "properties") {
			const lines = content.split("\n");
			for (const line of lines) {
				const match = line.match(/^([^#\s][^=]*)=(.*)$/);
				if (match) {
					result[match[1].trim()] = match[2].trim();
				}
			}
		} else {
			// Simple YAML parser for key-value pairs
			const lines = content.split("\n");
			let currentKey = "";

			for (const line of lines) {
				const match = line.match(/^(\s*)([^:#]+):\s*(.*)$/);
				if (match) {
					const indent = match[1].length;
					const key = match[2].trim();
					const value = match[3].trim();

					if (indent === 0) {
						currentKey = key;
						result[currentKey] = value || {};
					} else if (currentKey) {
						if (typeof result[currentKey] === "string" && !result[currentKey]) {
							result[currentKey] = {};
						}
						if (typeof result[currentKey] === "object") {
							(result[currentKey] as Record<string, any>)[key] = value;
						}
					}
				}
			}
		}

		return result;
	}

	/**
	 * Detect JDK vendor
	 */
	protected detectJdkVendor(dependencies: Dependency[]): JdkVendor {
		const config = vscode.workspace.getConfiguration("dockeryzen");
		const configuredVendor = config.get("defaultJdkImage") as string;

		switch (configuredVendor) {
			case "eclipse-temurin":
				return JdkVendor.ECLIPSE_TEMURIN;
			case "amazon-corretto":
				return JdkVendor.AMAZON_CORRETTO;
			case "openjdk":
				return JdkVendor.OPENJDK;
			case "oracle-jdk":
				return JdkVendor.ORACLE_JDK;
			case "graalvm":
				return JdkVendor.GRAALVM;
			case "liberica":
				return JdkVendor.LIBERICA;
			case "redhat-openjdk":
				return JdkVendor.REDHAT_OPENJDK;
			default:
				return JdkVendor.ECLIPSE_TEMURIN;
		}
	}

	/**
	 * Check if project is multi-module
	 */
	protected async isMultiModule(): Promise<boolean> {
		const pomPath = path.join(this.workspaceFolder.uri.fsPath, "pom.xml");
		if (await fs.pathExists(pomPath)) {
			const content = await fs.readFile(pomPath, "utf8");
			return content.includes("<modules>") && content.includes("<module>");
		}

		const settingsPath = path.join(this.workspaceFolder.uri.fsPath, "settings.gradle");
		if (await fs.pathExists(settingsPath)) {
			const content = await fs.readFile(settingsPath, "utf8");
			return content.includes("include") && content.match(/include\s*\(/);
		}

		return false;
	}
}
