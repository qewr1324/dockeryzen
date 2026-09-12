import { BaseJarGenerator } from "./BaseJarGenerator.js";
import { FRAMEWORK_CONFIGS } from "./FrameworkTypes.js";

export class SpringBootJarGenerator extends BaseJarGenerator {
	protected readonly fwConfig = FRAMEWORK_CONFIGS["spring-boot"];

	generate(): string {
		this.validateJdk();
		return super.generate();
	}

	// ✅ NEW: Spring Boot 3.x+ نیاز به JDK 17
	protected getMinJdkForVersion(version: number): number {
		return version >= 3 ? 17 : 8;
	}

	// فقط health path رو override می‌کنیم (چون Base از /actuator/health استفاده می‌کنه
	// ولی می‌خوایم مطمئن بشیم healthCheckPath از config خونده می‌شه)
	protected getHealthCheck(): string {
		if (!this.config.enableHealthCheck) return "";

		const port = this.config.port;
		const path = this.config.healthCheckPath || this.fwConfig.healthPath;
		const primary = `curl -f http://localhost:${port}${path}`;
		const fallback = `curl -f http://localhost:${port}/ || exit 1`;

		return `\n# Health check (Spring Boot Actuator)\nHEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=5 \\\n  CMD ${primary} || ${fallback}`;
	}
}
