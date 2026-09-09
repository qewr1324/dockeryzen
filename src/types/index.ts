export interface ProjectConfig {
	projectName: string;
	language: string;
	port: number;
	useAlpine: boolean;
	enableDebug: boolean;
	enableHealthCheck: boolean;
	debugPort?: number;
	buildTool?: "maven" | "gradle";
	jdkVersion?: string;
	jdkVendor?: string;
	framework?: string;
	server?: string;
	nodeVersion?: string;
	pythonVersion?: string;
	goVersion?: string;
	rustVersion?: string;
	dotnetVersion?: string;
	phpVersion?: string;
	rubyVersion?: string;
	gccVersion?: string;
	packageManager?: "npm" | "yarn" | "pnpm" | "bun";
	healthCheckPath?: string;
	databases: DatabaseConfig[];
	messageQueues: MessageQueueConfig[];
	services: ServiceConfig[];
}

export interface DatabaseConfig {
	type: string;
	version: string;
	internalPort: number;
	externalPort: number;
	databaseName?: string;
	username?: string;
	password?: string;
	useAlpine: boolean;
	useExternalUrl?: boolean;
	url?: string;
	image?: string;
	alpineImage?: string;
	volumePath?: string;
}

export interface MessageQueueConfig {
	type: string;
	version: string;
	internalPort: number;
	externalPort: number;
	useAlpine: boolean;
	image?: string;
	alpineImage?: string;
	topics?: string[];
}

export interface ServiceConfig {
	type: string;
	version: string;
	internalPort: number;
	externalPort: number;
	useAlpine: boolean;
	image?: string;
	alpineImage?: string;
	command?: string;
}
