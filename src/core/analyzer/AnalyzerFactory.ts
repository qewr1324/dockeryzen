import * as vscode from "vscode";
import { BuildTool } from "../../types/interfaces.js";
import { ProjectAnalyzer } from "./ProjectAnalyzer.js";
import { JavaProjectAnalyzer } from "./JavaProjectAnalyzer.js";
import { MavenAnalyzer } from "./MavenAnalyzer.js";
import { GradleAnalyzer } from "./GradleAnalyzer.js";

export class AnalyzerFactory {
	public static async createAnalyzer(workspaceFolder: vscode.WorkspaceFolder): Promise<ProjectAnalyzer> {
		const tempAnalyzer = new JavaProjectAnalyzer(workspaceFolder);
		const buildTool = await tempAnalyzer["detectBuildTool"]();

		switch (buildTool) {
			case BuildTool.MAVEN:
				return new MavenAnalyzer(workspaceFolder);
			case BuildTool.GRADLE:
				return new GradleAnalyzer(workspaceFolder);
			default:
				return tempAnalyzer;
		}
	}
}
