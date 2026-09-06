import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import * as xml2js from "xml2js";
import type { ProjectAnalysis, Dependency } from "../../types/interfaces.js";
import { Framework } from "../../types/interfaces.js";
import { JavaProjectAnalyzer } from "./JavaProjectAnalyzer.js";

/**
 * Maven project analyzer
 */
export class MavenAnalyzer extends JavaProjectAnalyzer {
	/**
	 * Analyze Maven project
	 */
	public async analyze(): Promise<ProjectAnalysis> {
		const analysis = await super.analyze();

		// Additional Maven-specific analysis
		const pomDetails = await this.parsePomFile();

		if (pomDetails) {
			// Extract additional dependencies
			const additionalDeps = pomDetails.dependencies || [];
			analysis.dependencies = [...analysis.dependencies, ...additionalDeps];

			// Extract Maven plugins
			const plugins = pomDetails.plugins || [];
			for (const plugin of plugins) {
				if (plugin.artifactId === "spring-boot-maven-plugin") {
					analysis.framework = Framework.SPRING_BOOT;
				}
			}
		}

		return analysis;
	}

	/**
	 * Parse pom.xml file
	 */
	private async parsePomFile(): Promise<any> {
		const pomPath = path.join(this.workspaceFolder.uri.fsPath, "pom.xml");

		if (!(await fs.pathExists(pomPath))) {
			return undefined;
		}

		const content = await fs.readFile(pomPath, "utf8");
		const parser = new xml2js.Parser();

		try {
			const result = await parser.parseStringPromise(content);
			const project = result.project;

			const dependencies: Dependency[] = [];
			const plugins: any[] = [];

			// Extract dependencies
			if (project.dependencies && project.dependencies[0].dependency) {
				for (const dep of project.dependencies[0].dependency) {
					dependencies.push({
						groupId: dep.groupId?.[0] || "",
						artifactId: dep.artifactId?.[0] || "",
						version: dep.version?.[0] || "",
						scope: dep.scope?.[0],
						optional: dep.optional?.[0] === "true",
					});
				}
			}

			// Extract build plugins
			if (project.build && project.build[0].plugins && project.build[0].plugins[0].plugin) {
				for (const plugin of project.build[0].plugins[0].plugin) {
					plugins.push({
						groupId: plugin.groupId?.[0] || "",
						artifactId: plugin.artifactId?.[0] || "",
						version: plugin.version?.[0] || "",
					});
				}
			}

			return {
				dependencies,
				plugins,
				properties: project.properties?.[0] || {},
			};
		} catch (error) {
			console.error("Error parsing pom.xml:", error);
			return undefined;
		}
	}
}
