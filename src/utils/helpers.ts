import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";

export function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
	return vscode.workspace.workspaceFolders?.[0];
}

export function getWorkspacePath(): string | undefined {
	return getWorkspaceFolder()?.uri.fsPath;
}

export function sanitizeName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

export function validatePort(port: string): string | null {
	const portNum = parseInt(port);
	if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
		return "Please enter a valid port number (1-65535)";
	}
	return null;
}

export function validateProjectName(name: string): string | null {
	if (!name || name.length === 0) {
		return "Project name cannot be empty";
	}
	if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
		return "Project name can only contain letters, numbers, hyphens, and underscores";
	}
	if (name.length > 50) {
		return "Project name must be less than 50 characters";
	}
	return null;
}

export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

export async function writeFileIfNotExists(filePath: string, content: string): Promise<boolean> {
	if (await fileExists(filePath)) {
		return false;
	}

	await fs.writeFile(filePath, content);
	return true;
}

export function getImageName(config: any, type: string): string {
	const imageMap: Record<string, string> = {
		postgresql: "postgres",
		mysql: "mysql",
		mariadb: "mariadb",
		redis: "redis",
		mongodb: "mongo",
		elasticsearch: "docker.elastic.co/elasticsearch/elasticsearch",
		kafka: "confluentinc/cp-kafka",
		rabbitmq: "rabbitmq",
		nginx: "nginx",
		grafana: "grafana/grafana",
		prometheus: "prom/prometheus",
		keycloak: "quay.io/keycloak/keycloak",
		minio: "minio/minio",
	};

	return imageMap[type] || type;
}
