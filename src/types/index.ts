export interface ProjectConfig {
	projectName: string;
	language: string;
	port: number;
	useAlpine: boolean;
	enableDebug: boolean;
	enableHealthCheck: boolean;
	buildTool?: "maven" | "gradle";
	jdkVersion?: string;
	jdkVendor?: string;
	framework?: string;
	server?: string;
	nodeVersion?: string;
	pythonVersion?: string;
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
}

export interface MessageQueueConfig {
	type: string;
	version: string;
	internalPort: number;
	externalPort: number;
	useAlpine: boolean;
}

export interface ServiceConfig {
	type: string;
	version: string;
	internalPort: number;
	externalPort: number;
	useAlpine: boolean;
}

export interface DatabaseDefinition {
	label: string;
	value: string;
	defaultPort: number;
	defaultUser: string;
	defaultDatabase?: string;
	category: string;
	versions: string[];
}

export interface MessageQueueDefinition {
	label: string;
	value: string;
	defaultPort: number;
	versions: string[];
}

export interface ServiceDefinition {
	label: string;
	value: string;
	defaultPort: number;
	versions: string[];
}
