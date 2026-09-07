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

		if (await fs.pathExists(pomPath)) {
			buildContent = await fs.readFile(pomPath, "utf8");
		} else if (await fs.pathExists(gradlePath)) {
			buildContent = await fs.readFile(gradlePath, "utf8");
		} else if (await fs.pathExists(gradleKtsPath)) {
			buildContent = await fs.readFile(gradleKtsPath, "utf8");
		}

		if (buildContent.includes("spring-boot") || buildContent.includes("spring-boot-starter") || buildContent.includes("SpringBootApplication")) {
			return Framework.SPRING_BOOT;
		}

		if (buildContent.includes("quarkus")) {
			return Framework.QUARKUS;
		}

		if (buildContent.includes("micronaut")) {
			return Framework.MICRONAUT;
		}

		if (buildContent.includes("vertx")) {
			return Framework.VERTX;
		}

		if (buildContent.includes("play-framework") || buildContent.includes("com.typesafe.play")) {
			return Framework.PLAY;
		}

		if (buildContent.includes("dropwizard")) {
			return Framework.DROPWIZARD;
		}

		if (buildContent.includes("spring-webmvc") || buildContent.includes("spring-web")) {
			return Framework.SPRING_MVC;
		}

		if (buildContent.includes("jakarta") || buildContent.includes("jakarta-ee")) {
			return Framework.JAKARTA_EE;
		}

		if (buildContent.includes("javax") || buildContent.includes("java-ee")) {
			return Framework.JAVA_EE;
		}

		if (buildContent.includes("hibernate") || buildContent.includes("jpa") || buildContent.includes("spring-data-jpa")) {
			return Framework.JPA_HIBERNATE;
		}

		if (buildContent.includes("struts")) {
			return Framework.STRUTS;
		}

		if (buildContent.includes("jsf") || buildContent.includes("faces")) {
			return Framework.JSF;
		}

		if (buildContent.includes("jax-rs") || buildContent.includes("jersey") || buildContent.includes("resteasy")) {
			return Framework.JAX_RS;
		}

		if (buildContent.includes("servlet") || buildContent.includes("web.xml")) {
			return Framework.JAKARTA_EE;
		}

		return Framework.NONE;
	}
}
