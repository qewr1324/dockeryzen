import { BaseJarGenerator } from "./BaseJarGenerator.js";
import { FRAMEWORK_CONFIGS } from "./FrameworkTypes.js";

export class MicronautJarGenerator extends BaseJarGenerator {
	protected readonly fwConfig = FRAMEWORK_CONFIGS["micronaut"];

	generate(): string {
		this.validateJdk();
		return super.generate();
	}

	// ✅ NEW: Micronaut 4.x نیاز به JDK 17
	protected getMinJdkForVersion(version: number): number {
		return version >= 4 ? 17 : 8;
	}

	// ✅ Health path مخصوص Micronaut
	protected getHealthCheck(): string {
		if (!this.config.enableHealthCheck) return "";

		const port = this.config.port;
		const path = this.config.healthCheckPath || this.fwConfig.healthPath;
		const primary = `curl -f http://localhost:${port}${path}`;
		const fallback = `curl -f http://localhost:${port}/ || exit 1`;

		return `\n# Health check (Micronaut Management)\nHEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=5 \\\n  CMD ${primary} || ${fallback}`;
	}
}
