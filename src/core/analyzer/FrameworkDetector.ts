import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import { Framework } from "../../types/interfaces.js";

/**
 * Framework detector
 */
export class FrameworkDetector {
	private workspaceFolder: vscode.WorkspaceFolder;

	constructor(workspaceFolder: vscode.WorkspaceFolder) {
		this.workspaceFolder = workspaceFolder;
	}

	/**
	 * Detect framework from project
	 */
	public async detect(): Promise<Framework> {
		const pomPath = path.join(this.workspaceFolder.uri.fsPath, "pom.xml");
		const gradlePath = path.join(this.workspaceFolder.uri.fsPath, "build.gradle");
		const gradleKtsPath = path.join(this.workspaceFolder.uri.fsPath, "build.gradle.kts");

		let buildContent = "";

		// Check Maven
		if (await fs.pathExists(pomPath)) {
			buildContent = await fs.readFile(pomPath, "utf8");
		}
		// Check Gradle
		else if (await fs.pathExists(gradlePath)) {
			buildContent = await fs.readFile(gradlePath, "utf8");
		} else if (await fs.pathExists(gradleKtsPath)) {
			buildContent = await fs.readFile(gradleKtsPath, "utf8");
		}

		// Check for Spring Boot
		if (buildContent.includes("spring-boot") || buildContent.includes("spring-boot-starter") || buildContent.includes("SpringBootApplication")) {
			return Framework.SPRING_BOOT;
		}

		// Check for Quarkus
		if (buildContent.includes("quarkus")) {
			return Framework.QUARKUS;
		}

		// Check for Micronaut
		if (buildContent.includes("micronaut")) {
			return Framework.MICRONAUT;
		}

		// Check for Vert.x
		if (buildContent.includes("vertx")) {
			return Framework.VERTX;
		}

		// Check for Play Framework
		if (buildContent.includes("play-framework") || buildContent.includes("com.typesafe.play")) {
			return Framework.PLAY;
		}

		// Check for Dropwizard
		if (buildContent.includes("dropwizard")) {
			return Framework.DROPWIZARD;
		}

		// Check for Spring MVC
		if (buildContent.includes("spring-webmvc") || buildContent.includes("spring-web")) {
			return Framework.SPRING_MVC;
		}

		// Check for Jakarta EE
		if (buildContent.includes("jakarta") || buildContent.includes("jakarta-ee")) {
			return Framework.JAKARTA_EE;
		}

		// Check for Java EE
		if (buildContent.includes("javax") || buildContent.includes("java-ee")) {
			return Framework.JAVA_EE;
		}

		// Check for JPA/Hibernate
		if (buildContent.includes("hibernate") || buildContent.includes("jpa") || buildContent.includes("spring-data-jpa")) {
			return Framework.JPA_HIBERNATE;
		}

		// Check for Struts
		if (buildContent.includes("struts")) {
			return Framework.STRUTS;
		}

		// Check for JSF
		if (buildContent.includes("jsf") || buildContent.includes("faces")) {
			return Framework.JSF;
		}

		// Check for JAX-RS
		if (buildContent.includes("jax-rs") || buildContent.includes("jersey") || buildContent.includes("resteasy")) {
			return Framework.JAX_RS;
		}

		// Check for Servlet (simple web app)
		if (buildContent.includes("servlet") || buildContent.includes("web.xml")) {
			return Framework.JAKARTA_EE;
		}

		return Framework.NONE;
	}
}
