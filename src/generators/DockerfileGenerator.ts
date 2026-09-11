import { ProjectConfig } from "../types/index.js";
import { JavaJarDockerfileGenerator } from "./dockerfile/JavaJarDockerfileGenerator.js";
import { JavaWarDockerfileGenerator } from "./dockerfile/JavaWarDockerfileGenerator.js";
import { JSFrontendDockerfileGenerator } from "./dockerfile/JSFrontendDockerfileGenerator.js";
import { JSBackendDockerfileGenerator } from "./dockerfile/JSBackendDockerfileGenerator.js";
import { PythonDockerfileGenerator } from "./dockerfile/PythonDockerfileGenerator.js";
import { GoDockerfileGenerator } from "./dockerfile/GoDockerfileGenerator.js";
import { RustDockerfileGenerator } from "./dockerfile/RustDockerfileGenerator.js";
import { DotNetDockerfileGenerator } from "./dockerfile/DotNetDockerfileGenerator.js";
import { LaravelDockerfileGenerator } from "./dockerfile/LaravelDockerfileGenerator.js";
import { RailsDockerfileGenerator } from "./dockerfile/RailsDockerfileGenerator.js";
import { CppDockerfileGenerator } from "./dockerfile/CppDockerfileGenerator.js";
import { CDockerfileGenerator } from "./dockerfile/CDockerfileGenerator.js";
import { GenericDockerfileGenerator } from "./dockerfile/GenericDockerfileGenerator.js";

export class DockerfileGenerator {
	constructor(
		private config: ProjectConfig,
		private langConfig?: any,
	) {}

	generate(): string {
		switch (this.config.language) {
			case "java-jar":
				return new JavaJarDockerfileGenerator(this.config, this.langConfig).generate();
			case "java-war":
				return new JavaWarDockerfileGenerator(this.config, this.langConfig).generate();
			case "js-frontend":
				return new JSFrontendDockerfileGenerator(this.config, this.langConfig).generate();
			case "js-backend":
				return new JSBackendDockerfileGenerator(this.config, this.langConfig).generate();
			case "python":
				return new PythonDockerfileGenerator(this.config, this.langConfig).generate();
			case "go":
				return new GoDockerfileGenerator(this.config, this.langConfig).generate();
			case "rust":
				return new RustDockerfileGenerator(this.config, this.langConfig).generate();
			case "dotnet":
				return new DotNetDockerfileGenerator(this.config, this.langConfig).generate();
			case "laravel":
				return new LaravelDockerfileGenerator(this.config, this.langConfig).generate();
			case "rails":
				return new RailsDockerfileGenerator(this.config, this.langConfig).generate();
			case "cpp":
				return new CppDockerfileGenerator(this.config, this.langConfig).generate();
			case "c":
				return new CDockerfileGenerator(this.config, this.langConfig).generate();
			default:
				return new GenericDockerfileGenerator(this.config, this.langConfig).generate();
		}
	}
}
