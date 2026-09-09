import { ProjectConfig } from "../types/index.js";

export class DockerignoreGenerator {
	constructor(private config: ProjectConfig) {}

	generate(language?: string): string {
		const ignorePatterns: string[] = [
			"# Version Control",
			".git",
			".gitignore",
			".gitattributes",
			"",
			"# IDE",
			".vscode",
			".idea",
			"*.swp",
			"*.swo",
			"*~",
			"",
			"# OS",
			".DS_Store",
			"Thumbs.db",
			"",
			"# Environment",
			".env",
			".env.local",
			".env.development.local",
			".env.test.local",
			".env.production.local",
			"",
		];

		// Language-specific patterns
		const lang = language || this.config.language;

		if (lang.startsWith("js")) {
			ignorePatterns.push("# Node.js", "node_modules", "npm-debug.log*", "yarn-debug.log*", "yarn-error.log*", "pnpm-debug.log*", ".npm", ".node-gyp", ".npmrc", ".pnpm-store", ".yarn-integrity", "dist", "build", ".next", ".nuxt", "out", "");
		} else if (lang.startsWith("java")) {
			ignorePatterns.push("# Java", "target", "*.class", "*.jar", "*.war", "*.ear", "*.log", ".mvn", "mvnw", "mvnw.cmd", ".gradle", "build", "");
		} else if (lang === "python") {
			ignorePatterns.push("# Python", "__pycache__", "*.py[cod]", "*$py.class", "*.so", ".Python", "env", "venv", "ENV", "env.bak", "venv.bak", "pip-log.txt", ".pytest_cache", ".coverage", "htmlcov", ".tox", ".nox", ".hypothesis", ".mypy_cache", "dist", "build", "");
		} else if (lang === "go") {
			ignorePatterns.push("# Go", "*.exe", "*.exe~", "*.dll", "*.so", "*.dylib", "*.test", "*.out", "go.work", "bin", "dist", "");
		} else if (lang === "rust") {
			ignorePatterns.push("# Rust", "target/", "**/*.rs.bk", "");
		} else if (lang === "dotnet") {
			ignorePatterns.push("# .NET", "**/[Oo]bj/", "**/[Bb]in/", "*.user", "*.suo", "*.userprefs", "*.cache", "dist", "build", "");
		} else if (lang === "laravel") {
			ignorePatterns.push("# PHP/Laravel", "vendor/", "*.log", ".phpunit.result.cache", "node_modules", "");
		} else if (lang === "rails") {
			ignorePatterns.push("# Ruby/Rails", "*.gem", ".bundle", "vendor/bundle", "log/*", "tmp/*", ".ruby-version", ".ruby-gemset", "node_modules", "");
		} else if (lang === "cpp" || lang === "c") {
			ignorePatterns.push("# C/C++", "*.o", "*.obj", "*.exe", "*.out", "*.app", "build", "dist", "cmake-build-*", "");
		}

		// Docker files (not ignored so they can be built)
		ignorePatterns.push(
			"# Docker",
			"docker-compose.*.yml",
			"docker-compose.*.yaml",
			"",
			"# Documentation",
			"README.md",
			"LICENSE",
			"*.md",
			"docs",
			"",
			"# Testing",
			"coverage",
			".nyc_output",
			".cache",
			"*.spec.js",
			"*.test.js",
			"*.spec.ts",
			"*.test.ts",
			"",
			"# Logs",
			"logs",
			"*.log",
			"",
			"# Temp files",
			"tmp",
			"temp",
			"*.tmp",
			"*.temp",
			"",
		);

		return ignorePatterns.join("\n");
	}
}
