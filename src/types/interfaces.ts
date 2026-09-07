/**
 * Core interfaces for Dockeryzen
 */

/** Project analysis result */
export interface ProjectAnalysis {
	/** Project type detected */
	projectType: ProjectType;
	/** Build tool detected */
	buildTool: BuildTool;
	/** Framework detected */
	framework: Framework;
	/** JDK version */
	jdkVersion: string;
	/** JDK vendor */
	jdkVendor: JdkVendor;
	/** Application port */
	port: number;
	/** Database configuration */
	database?: DatabaseConfig;
	/** Dependencies list */
	dependencies: Dependency[];
	/** Main class name */
	mainClass?: string;
	/** Output type (JAR/WAR) */
	outputType: OutputType;
	/** Project modules (for multi-module) */
	modules?: ProjectModule[];
	/** Configuration files found */
	configFiles: ConfigFile[];
	/** JVM options */
	jvmOptions?: string;
	/** Spring profiles */
	profiles?: string[];
	/** Environment variables */
	envVariables: Record<string, string>;
}

/** Project types */
export enum ProjectType {
	MAVEN = "maven",
	GRADLE = "gradle",
	MULTI_MODULE = "multi-module",
	UNKNOWN = "unknown",
}

/** Build tools */
export enum BuildTool {
	MAVEN = "maven",
	GRADLE = "gradle",
	NONE = "none",
}

/** Frameworks */
export enum Framework {
	SPRING_BOOT = "spring-boot",
	SPRING_MVC = "spring-mvc",
	JAVA_EE = "java-ee",
	JAKARTA_EE = "jakarta-ee",
	QUARKUS = "quarkus",
	MICRONAUT = "micronaut",
	VERTX = "vertx",
	PLAY = "play",
	DROPWIZARD = "dropwizard",
	STRUTS = "struts",
	JSF = "jsf",
	JAX_RS = "jax-rs",
	JPA_HIBERNATE = "jpa-hibernate",
	NONE = "none",
}

/** JDK vendors */
export enum JdkVendor {
	ECLIPSE_TEMURIN = "eclipse-temurin",
	AMAZON_CORRETTO = "amazon-corretto",
	OPENJDK = "openjdk",
	ORACLE_JDK = "oracle-jdk",
	GRAALVM = "graalvm",
	LIBERICA = "liberica",
	REDHAT_OPENJDK = "redhat-openjdk",
}

/** Output types */
export enum OutputType {
	JAR = "jar",
	WAR = "war",
	NATIVE = "native",
}

/** Database configuration */
export interface DatabaseConfig {
	type: DatabaseType;
	version: string;
	port: number;
	/** External port for docker-compose mapping */
	externalPort?: number;
	name: string;
	username: string;
	password: string;
	host?: string;
	/** Custom JDBC URL for external connections */
	customUrl?: string;
	/** Connection mode: standard or custom */
	connectionMode?: "standard" | "custom";
	/** Use Alpine variant */
	useAlpine?: boolean;
}

/** Database types */
export enum DatabaseType {
	POSTGRESQL = "postgresql",
	MYSQL = "mysql",
	MARIADB = "mariadb",
	MONGODB = "mongodb",
	REDIS = "redis",
	CASSANDRA = "cassandra",
	ELASTICSEARCH = "elasticsearch",
	NEO4J = "neo4j",
	H2 = "h2",
	NONE = "none",
}

/** Dependency */
export interface Dependency {
	groupId: string;
	artifactId: string;
	version: string;
	scope?: string;
	optional?: boolean;
}

/** Project module */
export interface ProjectModule {
	name: string;
	path: string;
	type: ProjectType;
	framework: Framework;
	port: number;
	mainClass?: string;
}

/** Configuration file */
export interface ConfigFile {
	path: string;
	type: "properties" | "yml" | "yaml" | "xml" | "json";
	content: Record<string, any>;
}

/** Docker configuration */
export interface DockerConfig {
	/** Base image */
	baseImage: string;
	/** JDK version */
	jdkVersion: string;
	/** Application port */
	port: number;
	/** JVM options */
	jvmOptions: string;
	/** Enable debug */
	enableDebug: boolean;
	/** Debug port */
	debugPort: number;
	/** Enable health check */
	enableHealthCheck: boolean;
	/** Health check endpoint */
	healthCheckEndpoint: string;
	/** Output type */
	outputType: OutputType;
	/** Database config (single, for backward compatibility) */
	database?: DatabaseConfig;
	/** Multiple databases */
	databases?: DatabaseConfig[];
	/** Environment variables */
	envVariables: Record<string, string>;
	/** Docker compose services */
	composeServices: ComposeService[];
	/** Volumes */
	volumes: Volume[];
	/** Networks */
	networks: Network[];
	/** Resource limits */
	resourceLimits?: ResourceLimits;
	/** Generate .env file */
	generateEnvFile?: boolean;
	/** Message queues */
	messageQueues?: MessageQueueConfig[];
	/** Additional services */
	additionalServices?: AdditionalServiceConfig[];
	/** Use Alpine for base image */
	useAlpine?: boolean;
}

/** Message queue configuration */
export interface MessageQueueConfig {
	type: "kafka" | "rabbitmq" | "activemq";
	version: string;
	port: number;
	/** External port for docker-compose mapping */
	externalPort?: number;
	/** Use Alpine variant */
	useAlpine?: boolean;
	/** Username (for RabbitMQ) */
	username?: string;
	/** Password (for RabbitMQ) */
	password?: string;
}

/** Additional service configuration */
export interface AdditionalServiceConfig {
	type: "nginx" | "grafana" | "prometheus" | "keycloak" | "minio";
	version: string;
	port: number;
	/** External port for docker-compose mapping */
	externalPort?: number;
	/** Use Alpine variant */
	useAlpine?: boolean;
	/** Username (for services that require it) */
	username?: string;
	/** Password (for services that require it) */
	password?: string;
}

/** Health check configuration */
export interface HealthCheckConfig {
	test: string[];
	interval: string;
	timeout: string;
	retries: number;
	start_period?: string;
}

/** Logging configuration */
export interface LoggingConfig {
	driver: string;
	options: Record<string, string>;
}

/** Docker Compose service */
export interface ComposeService {
	name: string;
	image?: string;
	build?: {
		context: string;
		dockerfile: string;
	};
	ports: string[];
	environment: Record<string, string>;
	env_file?: string[];
	volumes: string[];
	depends_on: string[];
	healthcheck?: HealthCheckConfig;
	restart?: string;
	networks: string[];
	logging?: LoggingConfig;
	deploy?: {
		resources?: {
			limits?: {
				cpus?: string;
				memory?: string;
			};
			reservations?: {
				cpus?: string;
				memory?: string;
			};
		};
	};
}

/** Volume */
export interface Volume {
	name: string;
	driver?: string;
}

/** Network */
export interface Network {
	name: string;
	driver: string;
}

/** Resource limits */
export interface ResourceLimits {
	cpus: string;
	memory: string;
}

/** Generation result */
export interface GenerationResult {
	files: GeneratedFile[];
	warnings: string[];
	errors: string[];
}

/** Generated file */
export interface GeneratedFile {
	path: string;
	content: string;
	type: "dockerfile" | "dockerignore" | "compose" | "env" | "devcontainer" | "other";
}

/** User preferences */
export interface UserPreferences {
	jdkImage: JdkVendor;
	port: number;
	jvmOptions: string;
	enableDebug: boolean;
	enableHealthCheck: boolean;
	databaseType: DatabaseType;
	databaseVersion: string;
	databaseName: string;
	databaseUsername: string;
	databasePassword: string;
	outputPath: string;
	imageOptimization: "alpine" | "full" | "slim";
	enableCompose: boolean;
	enableDevContainer: boolean;
	enableCiCd: boolean;
	enableKubernetes: boolean;
}
