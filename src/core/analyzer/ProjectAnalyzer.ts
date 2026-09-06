import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import type { ProjectAnalysis, ProjectType, BuildTool, Framework } from "../../types/interfaces.js";
import { MavenAnalyzer } from "./MavenAnalyzer.js";
import { GradleAnalyzer } from "./GradleAnalyzer.js";
import { FrameworkDetector } from "./FrameworkDetector.js";
import { ConfigManager } from "../config/ConfigManager.js";

/**
 * Abstract base class for project analyzers
 * Uses Strategy Pattern for different build tools
 */
export abstract class ProjectAnalyzer {
	protected workspaceFolder: vscode.WorkspaceFolder;
	protected configManager: ConfigManager;

	constructor(workspaceFolder: vscode.WorkspaceFolder) {
		this.workspaceFolder = workspaceFolder;
		this.configManager = ConfigManager.getInstance();
	}

	/**
	 * Analyze the project
	 */
	public abstract analyze(): Promise<ProjectAnalysis>;

	/**
	 * Detect build tool
	 */
	protected async detectBuildTool(): Promise<BuildTool> {
		const files = await vscode.workspace.findFiles(new vscode.RelativePattern(this.workspaceFolder, "**/{pom.xml,build.gradle,build.gradle.kts}"), "**/node_modules/**");

		if (files.length === 0) {
			return BuildTool.NONE;
		}

		for (const file of files) {
			if (file.fsPath.endsWith("pom.xml")) {
				return BuildTool.MAVEN;
			}
			if (file.fsPath.endsWith("build.gradle") || file.fsPath.endsWith("build.gradle.kts")) {
				return BuildTool.GRADLE;
			}
		}

		return BuildTool.NONE;
	}

	/**
	 * Detect JDK version
	 */
	protected async detectJdkVersion(buildTool: BuildTool): Promise<string> {
		const cacheKey = `${this.workspaceFolder.uri.fsPath}-jdk-version`;
		const cached = this.configManager.getCachedData(cacheKey);
		if (cached) {
			return cached;
		}

		let version = "17"; // Default

		if (buildTool === BuildTool.MAVEN) {
			const pomPath = path.join(this.workspaceFolder.uri.fsPath, "pom.xml");
			if (await fs.pathExists(pomPath)) {
				const content = await fs.readFile(pomPath, "utf8");
				const versionMatch = content.match(/<java\.version>(\d+)<\/java\.version>|<maven\.compiler\.source>(\d+)<\/maven\.compiler\.source>|<source>(\d+)<\/source>/);
				if (versionMatch) {
					version = versionMatch[1] || versionMatch[2] || versionMatch[3] || version;
				}
			}
		} else if (buildTool === BuildTool.GRADLE) {
			const gradlePath = path.join(this.workspaceFolder.uri.fsPath, "build.gradle");
			const gradleKtsPath = path.join(this.workspaceFolder.uri.fsPath, "build.gradle.kts");

			let content = "";
			if (await fs.pathExists(gradlePath)) {
				content = await fs.readFile(gradlePath, "utf8");
			} else if (await fs.pathExists(gradleKtsPath)) {
				content = await fs.readFile(gradleKtsPath, "utf8");
			}

			const versionMatch = content.match(/sourceCompatibility\s*=\s*['"]?(\d+)['"]?|JavaLanguageVersion\.of\((\d+)\)|toolchain\s*\{[\s\S]*?languageVersion\s*=\s*JavaLanguageVersion\.of\((\d+)\)/);
			if (versionMatch) {
				version = versionMatch[1] || versionMatch[2] || versionMatch[3] || version;
			}
		}

		this.configManager.cacheData(cacheKey, version);
		return version;
	}

	/**
	 * Detect application port
	 */
	protected async detectPort(): Promise<number> {
		const cacheKey = `${this.workspaceFolder.uri.fsPath}-port`;
		const cached = this.configManager.getCachedData(cacheKey);
		if (cached) {
			return cached;
		}

		let port = 8080; // Default

		// Check application.properties
		const propFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(this.workspaceFolder, "**/src/main/resources/application.{properties,yml,yaml}"), "**/node_modules/**");

		for (const file of propFiles) {
			const content = await fs.readFile(file.fsPath, "utf8");

			if (file.fsPath.endsWith(".properties")) {
				const portMatch = content.match(/server\.port\s*=\s*(\d+)/);
				if (portMatch) {
					port = parseInt(portMatch[1], 10);
				}
			} else {
				const portMatch = content.match(/server:\s*\n\s*port:\s*(\d+)/) || content.match(/port:\s*(\d+)/);
				if (portMatch) {
					port = parseInt(portMatch[1], 10);
				}
			}
		}

		// Check for common port patterns
		const allFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(this.workspaceFolder, "**/*.{properties,yml,yaml,java}"), "**/node_modules/**");

		for (const file of allFiles.slice(0, 50)) {
			// Limit files to check
			const content = await fs.readFile(file.fsPath, "utf8");
			const portPatterns = [/@Value\("\$\{server\.port:(\d+)\}"\)/, /@Value\("\$\{port:(\d+)\}"\)/, /PORT\s*=\s*(\d+)/, /port\s*=\s*(\d{4,5})/];

			for (const pattern of portPatterns) {
				const match = content.match(pattern);
				if (match) {
					port = parseInt(match[1], 10);
					break;
				}
			}
		}

		this.configManager.cacheData(cacheKey, port);
		return port;
	}

	/**
	 * Detect main class
	 */
	protected async detectMainClass(): Promise<string | undefined> {
		const javaFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(this.workspaceFolder, "**/src/main/java/**/*.java"), "**/node_modules/**");

		for (const file of javaFiles) {
			const content = await fs.readFile(file.fsPath, "utf8");

			// Check for @SpringBootApplication
			if (content.includes("@SpringBootApplication") || content.includes("@QuarkusMain") || content.includes("@Micronaut")) {
				const classMatch = content.match(/public\s+class\s+(\w+)/);
				if (classMatch) {
					return classMatch[1];
				}
			}

			// Check for main method
			if (content.includes("public static void main")) {
				const classMatch = content.match(/public\s+class\s+(\w+)/);
				if (classMatch) {
					return classMatch[1];
				}
			}
		}

		return undefined;
	}

	/**
	 * Analyze project structure
	 */
	protected async analyzeStructure(): Promise<{
		hasSrcMainJava: boolean;
		hasSrcMainResources: boolean;
		hasSrcTestJava: boolean;
		hasApplicationConfig: boolean;
	}> {
		const structure = {
			hasSrcMainJava: false,
			hasSrcMainResources: false,
			hasSrcTestJava: false,
			hasApplicationConfig: false,
		};

		const checkPath = async (relativePath: string): Promise<boolean> => {
			const fullPath = path.join(this.workspaceFolder.uri.fsPath, relativePath);
			return fs.pathExists(fullPath);
		};

		structure.hasSrcMainJava = await checkPath("src/main/java");
		structure.hasSrcMainResources = await checkPath("src/main/resources");
		structure.hasSrcTestJava = await checkPath("src/test/java");

		const configFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(this.workspaceFolder, "**/src/main/resources/application.{properties,yml,yaml}"), "**/node_modules/**");
		structure.hasApplicationConfig = configFiles.length > 0;

		return structure;
	}

	/**
	 * Create analyzer based on build tool
	 */
	public static async createAnalyzer(workspaceFolder: vscode.WorkspaceFolder): Promise<ProjectAnalyzer> {
		const analyzer = new JavaProjectAnalyzer(workspaceFolder);
		const buildTool = await analyzer["detectBuildTool"]();

		if (buildTool === BuildTool.MAVEN) {
			return new MavenAnalyzer(workspaceFolder);
		} else if (buildTool === BuildTool.GRADLE) {
			return new GradleAnalyzer(workspaceFolder);
		}

		return analyzer;
	}
}

// Import JavaProjectAnalyzer
import { JavaProjectAnalyzer } from "./JavaProjectAnalyzer";
