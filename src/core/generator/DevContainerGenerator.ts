import * as vscode from "vscode";
import type { ProjectAnalysis, DockerConfig } from "../../types/interfaces.js";

export class DevContainerGenerator {
	public generate(analysis: ProjectAnalysis, config: DockerConfig): string {
		const devContainer = {
			name: analysis.mainClass || "Java Development Container",
			image: `eclipse-temurin:${analysis.jdkVersion}`,
			forwardPorts: [config.port || analysis.port || 8080],
			remoteUser: "root",
			runArgs: ["--network=host"],
			customizations: {
				vscode: {
					extensions: ["vscjava.vscode-java-pack", "vscjava.vscode-maven", "vscjava.vscode-gradle", "redhat.java", "ms-azuretools.vscode-docker", "github.copilot", "github.copilot-chat"],
					settings: {
						"java.configuration.updateBuildConfiguration": "automatic",
						"java.compile.nullAnalysis.mode": "automatic",
						"java.import.gradle.enabled": true,
						"java.import.maven.enabled": true,
						"maven.terminal.useJavaHome": true,
					},
				},
			},
			features: {
				"ghcr.io/devcontainers/features/java:1": {
					version: analysis.jdkVersion,
					jdkDistro: this.getJdkDistro(analysis.jdkVendor),
				},
				"ghcr.io/devcontainers/features/docker-in-docker:2": {},
				"ghcr.io/devcontainers/features/git:1": {},
			},
			postCreateCommand: this.getPostCreateCommand(analysis),
			mounts: ["source=${localWorkspaceFolder},target=/workspace,type=bind"],
			containerEnv: {
				TZ: "UTC",
				LANG: "en_US.UTF-8",
			},
		};

		return JSON.stringify(devContainer, null, 2);
	}

	private getJdkDistro(jdkVendor: string): string {
		const distroMap: Record<string, string> = {
			"eclipse-temurin": "tem",
			"amazon-corretto": "corretto",
			openjdk: "open",
			"oracle-jdk": "oracle",
			liberica: "liberica",
			"redhat-openjdk": "rhel",
		};

		return distroMap[jdkVendor] || "tem";
	}

	private getPostCreateCommand(analysis: ProjectAnalysis): string {
		if (analysis.buildTool === "maven") {
			return "mvn clean install -DskipTests && mvn dependency:go-offline";
		} else if (analysis.buildTool === "gradle") {
			return "./gradlew clean build -x test && ./gradlew dependencies";
		}

		return 'echo "Container ready"';
	}
}
