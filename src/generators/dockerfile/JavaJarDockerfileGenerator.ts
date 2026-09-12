import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";
import { SpringBootJarGenerator } from "./java/SpringBootJarGenerator.js";
import { QuarkusJarGenerator } from "./java/QuarkusJarGenerator.js";
import { MicronautJarGenerator } from "./java/MicronautJarGenerator.js";

/**
 * Dispatcher: بر اساس framework، generator مناسب رو انتخاب می‌کنه.
 * منطق ساخت Dockerfile در سه کلاس جدا پیاده‌سازی شده.
 */
export class JavaJarDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
		const fw = this.config.framework?.toLowerCase();

		let generator: BaseDockerfileGenerator;

		switch (fw) {
			case "quarkus":
				generator = new QuarkusJarGenerator(this.config, this.langConfig);
				break;
			case "micronaut":
				generator = new MicronautJarGenerator(this.config, this.langConfig);
				break;
			case "spring-boot":
			case "springboot":
			default:
				generator = new SpringBootJarGenerator(this.config, this.langConfig);
				break;
		}

		return generator.generate();
	}
}
