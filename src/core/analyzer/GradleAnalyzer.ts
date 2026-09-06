import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import type { ProjectAnalysis, Dependency } from "../../types/interfaces.js";
import { Framework } from "../../types/interfaces.js";
import { JavaProjectAnalyzer } from "./JavaProjectAnalyzer.js";

/**
 * Gradle project analyzer
 */
export class GradleAnalyzer extends JavaProjectAnalyzer {
	/**
	 * Analyze Gradle project
	 */
	public async analyze(): Promise<ProjectAnalysis> {
		const analysis = await super.analyze();

		// Additional Gradle-specific analysis
		const gradleDetails = await this.parseGradleFile();

		if (gradleDetails) {
			const additionalDeps = gradleDetails.dependencies || [];
			analysis.dependencies = [...analysis.dependencies, ...additionalDeps];

			// Check for Spring Boot plugin
			if (gradleDetails.plugins?.some((p: string) => p.includes("spring-boot"))) {
				analysis.framework = Framework.SPRING_BOOT;
			}
		}

		return analysis;
	}

	/**
	 * Parse build.gradle file
	 */
	private async parseGradleFile(): Promise<any> {
		const gradlePath = path.join(this.workspaceFolder.uri.fsPath, "build.gradle");
		const gradleKtsPath = path.join(this.workspaceFolder.uri.fsPath, "build.gradle.kts");

		let content = "";
		let isKts = false;

		if (await fs.pathExists(gradlePath)) {
			content = await fs.readFile(gradlePath, "utf8");
		} else if (await fs.pathExists(gradleKtsPath)) {
			content = await fs.readFile(gradleKtsPath, "utf8");
			isKts = true;
		} else {
			return undefined;
		}

		const dependencies: Dependency[] = [];
		const plugins: string[] = [];

		// Extract plugins
		const pluginRegex = /(?:id|apply\s+plugin)\s*[\(\s]*['"]([^'"]+)['"]/g;
		let pluginMatch;
		while ((pluginMatch = pluginRegex.exec(content)) !== null) {
			plugins.push(pluginMatch[1]);
		}

		// Extract dependencies
		if (isKts) {
			const depRegex = /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*\(\s*"([^"]+)"\s*\)/g;
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
		} else {
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

		return {
			dependencies,
			plugins,
		};
	}
}
