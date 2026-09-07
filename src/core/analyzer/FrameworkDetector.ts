import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import { Framework } from "../../types/interfaces.js";

export class FrameworkDetector {
	private workspaceFolder: vscode.WorkspaceFolder;

	constructor(workspaceFolder: vscode.WorkspaceFolder) {
		this.workspaceFolder = workspaceFolder;
	}

	public async detect(): Promise<Framework> {
		const pomPath = path.join(this.workspaceFolder.uri.fsPath, "pom.xml");
		const gradlePath = path.join(this.workspaceFolder.uri.fsPath, "build.gradle");
		const gradleKtsPath = path.join(this.workspaceFolder.uri.fsPath, "build.gradle.kts");

		let buildContent = "";
		let isPom = false;

		if (await fs.pathExists(pomPath)) {
			buildContent = await fs.readFile(pomPath, "utf8");
			isPom = true;
		} else if (await fs.pathExists(gradlePath)) {
			buildContent = await fs.readFile(gradlePath, "utf8");
		} else if (await fs.pathExists(gradleKtsPath)) {
			buildContent = await fs.readFile(gradleKtsPath, "utf8");
		}

		buildContent = this.removeComments(buildContent, isPom);

		const dependencies = this.extractDependencies(buildContent, isPom);

		return this.detectFrameworkFromDependencies(dependencies, buildContent);
	}

	private removeComments(content: string, isPom: boolean): string {
		if (isPom) {
			content = content.replace(/<!--[\s\S]*?-->/g, "");
		} else {
			content = content.replace(/\/\/.*$/gm, "");
			content = content.replace(/\/\*[\s\S]*?\*\//g, "");
		}
		return content;
	}

	private extractDependencies(content: string, isPom: boolean): string[] {
		const dependencies: string[] = [];

		if (isPom) {
			const dependencyRegex = /<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<\/dependency>/g;
			let match;
			while ((match = dependencyRegex.exec(content)) !== null) {
				dependencies.push(`${match[1]}:${match[2]}`);
			}

			const pluginRegex = /<plugin>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<\/plugin>/g;
			while ((match = pluginRegex.exec(content)) !== null) {
				dependencies.push(`plugin:${match[1]}:${match[2]}`);
			}
		} else {
			const dependencyRegex = /(?:implementation|api|compileOnly|runtimeOnly|testImplementation|compile|runtime)\s*\(?\s*['"]([^'"]+)['"]/g;
			let match;
			while ((match = dependencyRegex.exec(content)) !== null) {
				dependencies.push(match[1]);
			}

			const pluginRegex = /(?:id|apply\s+plugin)\s*[\(\s]*['"]([^'"]+)['"]/g;
			while ((match = pluginRegex.exec(content)) !== null) {
				dependencies.push(`plugin:${match[1]}`);
			}
		}

		return dependencies;
	}

	private detectFrameworkFromDependencies(dependencies: string[], buildContent: string): Framework {
		if (dependencies.some((dep) => dep.includes("spring-boot") || dep.includes("spring-boot-starter") || dep.includes("spring-boot-maven-plugin") || dep.includes("org.springframework.boot"))) {
			return Framework.SPRING_BOOT;
		}

		if (dependencies.some((dep) => dep.includes("quarkus") || dep.includes("io.quarkus"))) {
			return Framework.QUARKUS;
		}

		if (dependencies.some((dep) => dep.includes("micronaut") || dep.includes("io.micronaut"))) {
			return Framework.MICRONAUT;
		}

		if (dependencies.some((dep) => dep.includes("vertx") || dep.includes("io.vertx"))) {
			return Framework.VERTX;
		}

		if (dependencies.some((dep) => dep.includes("play-framework") || dep.includes("com.typesafe.play"))) {
			return Framework.PLAY;
		}

		if (dependencies.some((dep) => dep.includes("dropwizard") || dep.includes("io.dropwizard"))) {
			return Framework.DROPWIZARD;
		}

		if (dependencies.some((dep) => dep.includes("spring-webmvc") || dep.includes("spring-web") || dep.includes("org.springframework:spring-webmvc"))) {
			return Framework.SPRING_MVC;
		}

		if (dependencies.some((dep) => dep.includes("jakarta") || dep.includes("jakarta-ee") || dep.includes("jakarta.servlet"))) {
			return Framework.JAKARTA_EE;
		}

		if (dependencies.some((dep) => dep.includes("javax") || dep.includes("java-ee") || dep.includes("javax.servlet"))) {
			return Framework.JAVA_EE;
		}

		if (dependencies.some((dep) => dep.includes("hibernate") || dep.includes("jpa") || dep.includes("spring-data-jpa"))) {
			return Framework.JPA_HIBERNATE;
		}

		if (dependencies.some((dep) => dep.includes("struts") || dep.includes("org.apache.struts"))) {
			return Framework.STRUTS;
		}

		if (dependencies.some((dep) => dep.includes("jsf") || dep.includes("faces") || dep.includes("javax.faces"))) {
			return Framework.JSF;
		}

		if (dependencies.some((dep) => dep.includes("jax-rs") || dep.includes("jersey") || dep.includes("resteasy") || dep.includes("javax.ws.rs"))) {
			return Framework.JAX_RS;
		}

		return Framework.NONE;
	}
}
