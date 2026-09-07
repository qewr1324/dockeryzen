import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import type { ProjectAnalysis } from "../../types/interfaces.js";
import { BuildTool } from "../../types/interfaces.js";

export abstract class ProjectAnalyzer {
	protected workspaceFolder: vscode.WorkspaceFolder;

	constructor(workspaceFolder: vscode.WorkspaceFolder) {
		this.workspaceFolder = workspaceFolder;
	}

	public abstract analyze(): Promise<ProjectAnalysis>;

	public async detectBuildTool(): Promise<BuildTool> {
		const pomPath = path.join(this.workspaceFolder.uri.fsPath, "pom.xml");
		const gradlePath = path.join(this.workspaceFolder.uri.fsPath, "build.gradle");
		const gradleKtsPath = path.join(this.workspaceFolder.uri.fsPath, "build.gradle.kts");

		if (await fs.pathExists(pomPath)) {
			return BuildTool.MAVEN;
		} else if ((await fs.pathExists(gradlePath)) || (await fs.pathExists(gradleKtsPath))) {
			return BuildTool.GRADLE;
		}

		return BuildTool.NONE;
	}

	protected async detectJdkVersion(buildTool: BuildTool): Promise<string> {
		let jdkVersion = "17";

		if (buildTool === BuildTool.MAVEN) {
			const pomPath = path.join(this.workspaceFolder.uri.fsPath, "pom.xml");
			if (await fs.pathExists(pomPath)) {
				const content = await fs.readFile(pomPath, "utf8");
				const versionMatch = content.match(/<java.version>([^<]+)<\/java.version>|<maven.compiler.source>([^<]+)<\/maven.compiler.source>/);
				if (versionMatch) {
					jdkVersion = versionMatch[1] || versionMatch[2];
				}
			}
		} else if (buildTool === BuildTool.GRADLE) {
			const gradlePath = path.join(this.workspaceFolder.uri.fsPath, "build.gradle");
			if (await fs.pathExists(gradlePath)) {
				const content = await fs.readFile(gradlePath, "utf8");
				const versionMatch = content.match(/sourceCompatibility\s*=\s*['"]?(\d+)['"]?|JavaVersion\.VERSION_(\d+)/);
				if (versionMatch) {
					jdkVersion = versionMatch[1] || versionMatch[2];
				}
			}
		}

		return jdkVersion;
	}

	protected async detectPort(): Promise<number> {
		let port = 8080;

		const propertiesFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(this.workspaceFolder, "**/application.properties"), "**/node_modules/**");

		for (const file of propertiesFiles) {
			const content = await fs.readFile(file.fsPath, "utf8");
			const portMatch = content.match(/server\.port\s*=\s*(\d+)/);
			if (portMatch) {
				port = parseInt(portMatch[1]);
				break;
			}
		}

		const yamlFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(this.workspaceFolder, "**/application.{yml,yaml}"), "**/node_modules/**");

		for (const file of yamlFiles) {
			const content = await fs.readFile(file.fsPath, "utf8");
			const portMatch = content.match(/port:\s*(\d+)/);
			if (portMatch) {
				port = parseInt(portMatch[1]);
				break;
			}
		}

		return port;
	}

	protected async detectMainClass(): Promise<string | undefined> {
		const javaFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(this.workspaceFolder, "**/*.java"), "**/node_modules/**");

		for (const file of javaFiles) {
			const content = await fs.readFile(file.fsPath, "utf8");

			if (content.includes("@SpringBootApplication") && content.includes("public static void main")) {
				const classMatch = content.match(/public\s+class\s+(\w+)/);
				if (classMatch) {
					return classMatch[1];
				}
			}
		}

		return undefined;
	}

	protected async analyzeStructure(): Promise<any> {
		const structure: any = {
			hasSrcFolder: false,
			hasResourcesFolder: false,
			hasTestFolder: false,
			hasDockerfile: false,
			hasDockerCompose: false,
		};

		const srcPath = path.join(this.workspaceFolder.uri.fsPath, "src");
		const resourcesPath = path.join(this.workspaceFolder.uri.fsPath, "src", "main", "resources");
		const testPath = path.join(this.workspaceFolder.uri.fsPath, "src", "test");
		const dockerfilePath = path.join(this.workspaceFolder.uri.fsPath, "Dockerfile");
		const dockerComposePath = path.join(this.workspaceFolder.uri.fsPath, "docker-compose.yml");

		structure.hasSrcFolder = await fs.pathExists(srcPath);
		structure.hasResourcesFolder = await fs.pathExists(resourcesPath);
		structure.hasTestFolder = await fs.pathExists(testPath);
		structure.hasDockerfile = await fs.pathExists(dockerfilePath);
		structure.hasDockerCompose = await fs.pathExists(dockerComposePath);

		return structure;
	}
}
