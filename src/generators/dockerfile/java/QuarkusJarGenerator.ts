import { BaseJarGenerator } from "./BaseJarGenerator.js";
import { FRAMEWORK_CONFIGS } from "./FrameworkTypes.js";

export class QuarkusJarGenerator extends BaseJarGenerator {
	protected readonly fwConfig = FRAMEWORK_CONFIGS["quarkus"];

	generate(): string {
		this.validateJdk();
		return super.generate();
	}

	// ✅ NEW: Quarkus 1.x→8, 2.x→11, 3.x→17
	protected getMinJdkForVersion(version: number): number {
		if (version === 1) return 8;
		if (version === 2) return 11;
		return 17;
	}

	/**
	 * تشخیص fast-jar vs uber-jar
	 * پیش‌فرض: fast-jar (چون Quarkus از 1.13 به بعد پیش‌فرضشه)
	 */
	// ✅ NEW: isFastJar بر اساس نسخه
	private isFastJar(): boolean {
		const packaging = (this.config as any).quarkusPackaging;
		if (packaging === "uber-jar") return false;
		if (packaging === "fast-jar") return true;

		// Quarkus 1.x = uber-jar، Quarkus 2.x+ = fast-jar
		if (this.config.frameworkVersion) {
			return this.config.frameworkVersion >= 2;
		}

		return true;
	}

	/**
	 * ✅ FIX: برای fast-jar، کل پوشه‌ی quarkus-app کپی می‌شه.
	 * برای uber-jar، روش قدیمی (find + cp) استفاده می‌شه.
	 * type باید دقیقاً با BaseJarGenerator یکسان باشه.
	 */
	protected buildRuntimeStage(): {
		jarCopySource: string;
		jarCopyDestination: string;
		jarFindCommand: string;
		entrypoint: string;
	} {
		const isGradle = this.config.buildTool === "gradle";
		const basePath = this.fwConfig.buildOutputPath(isGradle);

		if (this.isFastJar()) {
			// ✅ fast-jar: کل پوشه‌ی quarkus-app
			return {
				jarCopySource: `${basePath}/quarkus-app`, // ← /app/target/quarkus-app یا /app/build/quarkus-app
				jarCopyDestination: "/app/quarkus-app",
				jarFindCommand: "",
				entrypoint: "/app/quarkus-app/quarkus-run.jar",
			};
		}

		// uber-jar: روش قدیمی
		return {
			jarCopySource: basePath,
			jarCopyDestination: "/tmp/jars",
			jarFindCommand: this.buildJarFindCommand(),
			entrypoint: "app.jar",
		};
	}

	/**
	 * JAR Find — فقط برای uber-jar استفاده می‌شه
	 */
	protected buildJarFindCommand(): string {
		const excludes = this.fwConfig.excludePatterns.map((p) => `-not -name "${p}"`).join(" \\\n        ");

		return `JAR_FILE=$(find /tmp/jars -name "quarkus-run.jar" \\
        ${excludes} | head -n 1) && \\
    if [ -z "$JAR_FILE" ]; then \\
        JAR_FILE=$(find /tmp/jars -name "*-runner.jar" \\
        ${excludes} | head -n 1); \\
    fi && \\
    if [ -z "$JAR_FILE" ]; then \\
        JAR_FILE=$(find /tmp/jars -name "*.jar" \\
        ${excludes} | head -n 1); \\
    fi && \\
    if [ -z "$JAR_FILE" ]; then echo "ERROR: No Quarkus JAR found!" && exit 1; fi && \\
    echo "Selected JAR: $JAR_FILE" && \\
    cp "$JAR_FILE" app.jar && \\
    rm -rf /tmp/jars`;
	}

	/**
	 * ✅ Health Check با استفاده از fwConfig.healthPath (که /q/health هست)
	 */
	// ✅ NEW: health path بر اساس نسخه
	protected getHealthCheck(): string {
		if (!this.config.enableHealthCheck) return "";

		const port = this.config.port;

		// Quarkus 1.x = /health، Quarkus 2.x+ = /q/health
		let defaultPath = this.fwConfig.healthPath;
		if (this.config.frameworkVersion) {
			defaultPath = this.config.frameworkVersion >= 2 ? "/q/health" : "/health";
		}

		const path = this.config.healthCheckPath || defaultPath;
		return `\n# Health check (Quarkus SmallRye Health)\nHEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=5 \\\n  CMD curl -f http://localhost:${port}${path} || exit 1`;
	}
}
