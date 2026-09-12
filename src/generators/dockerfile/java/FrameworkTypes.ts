export type Framework = "spring-boot" | "quarkus" | "micronaut";

export interface FrameworkConfig {
	healthPath: string;
	profileEnv: string;
	jarPatterns: string[];
	excludePatterns: string[];
	buildOutputPath: (isGradle: boolean) => string;
	minJdk: number;
	mavenExtraArgs?: string;
	extraJvmOpts?: string[];
}

export const FRAMEWORK_CONFIGS: Record<Framework, FrameworkConfig> = {
	"spring-boot": {
		healthPath: "/actuator/health",
		profileEnv: "ENV SPRING_PROFILES_ACTIVE=production",
		jarPatterns: ["*.jar"],
		excludePatterns: ["*-sources.jar", "*-javadoc.jar", "*-plain.jar", "original-*.jar", "*.jar.original"],
		buildOutputPath: (isGradle) => (isGradle ? "/app/build/libs" : "/app/target"),
		minJdk: 8,
	},
	quarkus: {
		healthPath: "/q/health",
		profileEnv: "ENV QUARKUS_PROFILE=prod",
		jarPatterns: ["quarkus-run.jar", "*-runner.jar", "*.jar"],
		excludePatterns: ["*-sources.jar", "*-javadoc.jar", "original-*.jar", "*.jar.original", "*-dev.jar", "*-test.jar"],
		buildOutputPath: (isGradle) => (isGradle ? "/app/build" : "/app/target"),
		minJdk: 17,
		mavenExtraArgs: " -Dquarkus.profile=prod",
		extraJvmOpts: ["-Dquarkus.http.host=0.0.0.0"],
	},
	micronaut: {
		healthPath: "/health",
		profileEnv: "ENV MICRONAUT_ENVIRONMENTS=prod",
		jarPatterns: ["*.jar"],
		excludePatterns: ["*-sources.jar", "*-javadoc.jar", "original-*.jar", "*.jar.original"],
		buildOutputPath: (isGradle) => (isGradle ? "/app/build/libs" : "/app/target"),
		minJdk: 8,
	},
};
