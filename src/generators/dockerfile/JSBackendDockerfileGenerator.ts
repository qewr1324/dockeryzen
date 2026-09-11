import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class JSBackendDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
		const nodeVersion = this.config.nodeVersion || "18";
		const image = this.getNodeImage(nodeVersion);
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const installCmd = this.getPackageInstallCommand();
		const port = this.config.port;
		const usePm2 = this.config.enablePm2;
		const framework = this.config.framework;

		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 -h /home/appuser appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root -m -d /home/appuser appuser && chown -R appuser:root /app";

		const lockFilesCopy = `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* bun.lockb* .npmrc* tsconfig.json* tsconfig.*.json* .swcrc* .babelrc* .env.example* ./`;

		let entryCandidates: string[];
		if (framework === "nestjs") {
			entryCandidates = ["dist/main.js", "dist/main.mjs", "dist/src/main.js", "dist/index.js", "dist/server.js", "build/main.js", "main.js", "server.js"];
		} else if (framework === "fastify") {
			entryCandidates = ["dist/server.js", "dist/app.js", "dist/index.js", "dist/main.js", "build/server.js", "build/app.js", "build/index.js", "server.js", "app.js", "index.js", "main.js"];
		} else {
			entryCandidates = ["dist/index.js", "dist/main.js", "dist/server.js", "dist/app.js", "build/index.js", "build/main.js", "build/server.js", "index.js", "server.js", "main.js", "app.js"];
		}

		const firstEntry = entryCandidates[0];
		const firstCmd = usePm2 ? `if [ -f ${firstEntry} ]; then exec pm2-runtime start ${firstEntry} --name app;` : `if [ -f ${firstEntry} ]; then exec node ${firstEntry};`;

		const restEntries = entryCandidates
			.slice(1)
			.map((p) => `elif [ -f ${p} ]; then exec ${usePm2 ? `pm2-runtime start ${p} --name app` : `node ${p}`};`)
			.join(" \\\n            ");

		const entryPointCmd = `CMD ["sh", "-c", "${firstCmd} \\\n            ${restEntries} \\\n            else exec npm start; fi"]`;

		const pm2Install = usePm2 ? `\nRUN npm install -g pm2 && npm cache clean --force\nENV PM2_HOME=/home/appuser/.pm2\n` : "";

		const buildStep = `RUN if [ -f tsconfig.json ] || [ -f .swcrc ] || [ -f .babelrc ]; then \\
        if node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts.build ? 0 : 1)" 2>/dev/null; then \\
            npm run build; \\
        fi; \\
    fi`;

		return `# syntax=docker/dockerfile:1.4

FROM ${image}
WORKDIR /app

${healthCheckInstall}
${lockFilesCopy}
RUN --mount=type=cache,target=/root/.npm ${installCmd}
${pm2Install}
COPY . .
${buildStep}
RUN npm cache clean --force 2>/dev/null || true
${isAlpineUser}
USER appuser

ENV NODE_ENV=production \\
    PORT=${port}

${ociLabels}
EXPOSE ${port}${debugExpose}${healthCheck}
${entryPointCmd}`;
	}

	private getNodeImage(version: string): string {
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === version);
			if (versionConfig?.images) {
				if (this.config.useAlpine && versionConfig.images.alpine) return versionConfig.images.alpine;
				if (versionConfig.images.standard) return versionConfig.images.standard;
			}
		}
		return `node:${version}${this.config.useAlpine ? "-alpine" : ""}`;
	}

	private getPackageInstallCommand(): string {
		const pm = this.config.packageManager || "npm";
		switch (pm) {
			case "yarn":
				return "yarn install --frozen-lockfile || yarn install";
			case "pnpm":
				return "pnpm install --frozen-lockfile || pnpm install";
			case "bun":
				return "bun install";
			case "deno":
				return "deno cache --reload";
			default:
				return "if [ -f package-lock.json ]; then npm ci; else npm install; fi";
		}
	}
}
