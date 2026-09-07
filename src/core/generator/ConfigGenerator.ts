import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import { AnalyzerFactory } from "../analyzer/AnalyzerFactory.js";
import { DockerfileGenerator } from "./DockerfileGenerator.js";
import { ComposeGenerator } from "./ComposeGenerator.js";
import { IgnoreGenerator } from "./IgnoreGenerator.js";
import { EnvGenerator } from "./EnvGenerator.js";
import { DevContainerGenerator } from "./DevContainerGenerator.js";
import type { DockerConfig, DatabaseConfig, AdditionalServiceConfig } from "../../types/interfaces.js";
import { DatabaseType, OutputType } from "../../types/interfaces.js";

export async function generateFromConfig(workspaceFolder: vscode.WorkspaceFolder, config: any): Promise<void> {
	try {
		const databases = config.databases || [];
		const messageQueues = config.messageQueues || [];
		const services = config.services || [];

		const databaseConfigs: DatabaseConfig[] = [];
		for (const db of databases) {
			databaseConfigs.push({
				type: db.type as DatabaseType,
				version: db.version || "latest",
				port: db.port || getDefaultPort(db.type),
				externalPort: db.externalPort,
				name: db.name || "appdb",
				username: db.username || "admin",
				password: db.password || "password",
				host: db.host || db.type,
				useAlpine: db.useAlpine || false,
				connectionMode: db.connectionMode || "standard",
				customUrl: db.customUrl,
			});
		}

		// 🔧 اصلاح: اول از config خوندن outputType، بعد fallback به JAR
		let outputType = (config.project?.outputType as OutputType) || OutputType.JAR;

		// 🔧 اصلاح: فقط وقتی outputType در config مشخص نشده، از pom.xml تشخیص بده
		if (!config.project?.outputType) {
			const pomPath = path.join(workspaceFolder.uri.fsPath, "pom.xml");
			if (await fs.pathExists(pomPath)) {
				const pomContent = await fs.readFile(pomPath, "utf8");
				if (/<packaging>\s*war\s*<\/packaging>/.test(pomContent)) {
					outputType = OutputType.WAR;
				}
			}
		}

		const additionalServices: AdditionalServiceConfig[] = [];
		for (const svc of services) {
			if (["nginx", "grafana", "prometheus", "keycloak", "minio"].includes(svc.type)) {
				const serviceConfig: AdditionalServiceConfig = {
					type: svc.type,
					version: svc.version || getDefaultServiceVersion(svc.type),
					port: svc.port || getDefaultServicePort(svc.type),
					externalPort: svc.externalPort || svc.port || getDefaultServicePort(svc.type),
					useAlpine: svc.useAlpine || false,
				};

				switch (svc.type) {
					case "keycloak":
						serviceConfig.username = svc.username || "admin";
						serviceConfig.password = svc.password || "admin";
						break;
					case "minio":
						serviceConfig.username = svc.username || "minioadmin";
						serviceConfig.password = svc.password || "minioadmin";
						break;
					case "grafana":
						serviceConfig.username = svc.username || "admin";
						serviceConfig.password = svc.password || "admin";
						break;
				}

				additionalServices.push(serviceConfig);
			}
		}

		const dockerConfig: DockerConfig = {
			baseImage: config.docker?.baseImage || config.project?.jdkVendor || "eclipse-temurin",
			jdkVersion: config.project?.jdkVersion || "17",
			port: config.project?.port || 8080,
			jvmOptions: config.docker?.jvmOptions || "-Xmx512m -Xms256m",
			enableDebug: config.docker?.enableDebug || false,
			debugPort: config.docker?.debugPort || 5005,
			enableHealthCheck: config.docker?.enableHealthCheck ?? true,
			healthCheckEndpoint: config.docker?.healthCheckEndpoint || "/actuator/health",
			outputType: outputType,
			databases: databaseConfigs.length > 0 ? databaseConfigs : undefined,
			database: databaseConfigs.length > 0 ? databaseConfigs[0] : undefined,
			envVariables: {},
			composeServices: [],
			volumes: [],
			networks: [],
			generateEnvFile: config.envFile !== false,
			messageQueues: messageQueues,
			additionalServices: additionalServices.length > 0 ? additionalServices : undefined,
			useAlpine: config.docker?.useAlpine || false,
		};

		const analyzer = await AnalyzerFactory.createAnalyzer(workspaceFolder);
		const analysis = await analyzer.analyze();

		if (config.project?.port) analysis.port = config.project.port;
		if (config.project?.jdkVersion) analysis.jdkVersion = config.project.jdkVersion;

		// 🔧 اصلاح: outputType از config استفاده کنه
		analysis.outputType = outputType;

		if (databaseConfigs.length > 0) analysis.database = databaseConfigs[0];

		const outputPath = workspaceFolder.uri.fsPath;
		const generatedFiles: string[] = [];

		const dockerfileGenerator = new DockerfileGenerator();
		const dockerfile = dockerfileGenerator.generate(analysis, dockerConfig);
		await fs.writeFile(path.join(outputPath, "Dockerfile"), dockerfile, "utf8");
		generatedFiles.push("Dockerfile");

		const ignoreGenerator = new IgnoreGenerator();
		const dockerignore = ignoreGenerator.generate();
		await fs.writeFile(path.join(outputPath, ".dockerignore"), dockerignore, "utf8");
		generatedFiles.push(".dockerignore");

		const composeGenerator = new ComposeGenerator();
		const compose = composeGenerator.generate(analysis, dockerConfig);
		await fs.writeFile(path.join(outputPath, "docker-compose.yml"), compose, "utf8");
		generatedFiles.push("docker-compose.yml");

		if (config.envFile !== false && (databases.length > 0 || messageQueues.length > 0)) {
			const envGenerator = new EnvGenerator();
			const envContent = envGenerator.generate(analysis, dockerConfig);
			await fs.writeFile(path.join(outputPath, ".env"), envContent, "utf8");
			generatedFiles.push(".env");
		}

		if (config.devContainer?.enabled) {
			const devContainerGenerator = new DevContainerGenerator();
			const devContainerPath = path.join(outputPath, ".devcontainer", "devcontainer.json");
			await fs.ensureDir(path.dirname(devContainerPath));
			const devContainerContent = devContainerGenerator.generate(analysis, dockerConfig);
			await fs.writeFile(devContainerPath, devContainerContent, "utf8");
			generatedFiles.push(".devcontainer/devcontainer.json");
		}

		vscode.window.showInformationMessage(`✅ Dockeryzen: Generated ${generatedFiles.length} files from config!`);
	} catch (error) {
		vscode.window.showErrorMessage(`❌ Failed to generate from config: ${error}`);
	}
}

function getDefaultServicePort(type: string): number {
	const ports: Record<string, number> = {
		nginx: 80,
		grafana: 3000,
		prometheus: 9090,
		keycloak: 8080,
		minio: 9000,
	};
	return ports[type] || 8080;
}

function getDefaultServiceVersion(type: string): string {
	const versions: Record<string, string> = {
		nginx: "1.27",
		grafana: "11.2.0",
		prometheus: "v2.54.1",
		keycloak: "25.0.4",
		minio: "latest",
	};
	return versions[type] || "latest";
}

function getDefaultPort(dbType: string): number {
	const ports: Record<string, number> = {
		postgresql: 5432,
		mysql: 3306,
		mariadb: 3306,
		mongodb: 27017,
		redis: 6379,
		cassandra: 9042,
		elasticsearch: 9200,
		neo4j: 7687,
		h2: 9092,
	};
	return ports[dbType] || 5432;
}
