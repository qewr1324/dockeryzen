import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class JSFrontendDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
		const nodeVersion = this.config.nodeVersion || "18";
		const image = this.getNodeImage(nodeVersion);
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const framework = this.config.framework;
		const installCmd = this.getPackageInstallCommand();
		const port = this.config.port;

		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app";

		const lockFilesCopy = `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* bun.lockb* .npmrc* ./`;

		if (framework === "angular") {
			const projectName = this.config.projectName.replace(/[^a-zA-Z0-9-]/g, "-") || "app";
			return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${image} AS build
WORKDIR /app
${lockFilesCopy}
RUN --mount=type=cache,target=/root/.npm ${installCmd}
COPY . .
RUN npm run build -- --configuration production || npm run build

# Runtime stage (Nginx for SPA)
FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist /tmp/dist
RUN set -e; \\
    # اگر دایرکتوری browser داره
    if [ -d /tmp/dist/${projectName}/browser ]; then \\
        cp -r /tmp/dist/${projectName}/browser/* /usr/share/nginx/html/; \\
    elif [ -d /tmp/dist/${projectName} ]; then \\
        cp -r /tmp/dist/${projectName}/* /usr/share/nginx/html/; \\
    # fallback: اولین زیرپوشه با browser
    elif [ -n "$(find /tmp/dist -maxdepth 2 -type d -name browser | head -n 1)" ]; then \\
        BROWSER_DIR=$(find /tmp/dist -maxdepth 2 -type d -name browser | head -n 1); \\
        cp -r "$BROWSER_DIR"/* /usr/share/nginx/html/; \\
    # fallback: اولین زیرپوشه
    elif [ -n "$(find /tmp/dist -maxdepth 1 -mindepth 1 -type d | head -n 1)" ]; then \\
        FIRST_DIR=$(find /tmp/dist -maxdepth 1 -mindepth 1 -type d | head -n 1); \\
        cp -r "$FIRST_DIR"/* /usr/share/nginx/html/; \\
    else \\
        cp -r /tmp/dist/* /usr/share/nginx/html/; \\
    fi && \\
    rm -rf /tmp/dist

RUN printf 'server {\\n\\
    listen ${port};\\n\\
    server_name localhost;\\n\\
    root /usr/share/nginx/html;\\n\\
    index index.html;\\n\\
    location / {\\n\\
        try_files $uri $uri/ /index.html;\\n\\
    }\\n\\
    location ~* \\\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\\n\\
        expires 1y;\\n\\
        add_header Cache-Control "public, immutable";\\n\\
    }\\n\\
    gzip on;\\n\\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;\\n\\
}\\n' > /etc/nginx/conf.d/default.conf

${ociLabels}
EXPOSE ${port}

CMD ["nginx", "-g", "daemon off;"]`;
		} else if (framework === "nuxtjs") {
			return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${image} AS build
WORKDIR /app
${lockFilesCopy}
RUN --mount=type=cache,target=/root/.npm ${installCmd}
COPY . .
ENV NUXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runtime stage
FROM ${image}
WORKDIR /app
${healthCheckInstall}
ENV NODE_ENV=production \\
    PORT=${port} \\
    HOST=0.0.0.0 \\
    NUXT_TELEMETRY_DISABLED=1

COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/public ./public
COPY --from=build /app/nuxt.config.* ./
COPY --from=build /app/server ./server
COPY --from=build /app/static ./static

RUN npm cache clean --force 2>/dev/null || true
${isAlpineUser}
USER appuser
${ociLabels}
EXPOSE ${port}${debugExpose}${healthCheck}

CMD ["sh", "-c", "if [ -f .output/server/index.mjs ]; then exec node .output/server/index.mjs; elif [ -f .output/server/index.js ]; then exec node .output/server/index.js; else exec npm run start; fi"]`;
		} else {
			return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${image} AS build
WORKDIR /app
${lockFilesCopy}
RUN --mount=type=cache,target=/root/.npm ${installCmd}
COPY . .
RUN npm run build

# Runtime stage
FROM ${image}
WORKDIR /app
${healthCheckInstall}
ENV NODE_ENV=production \\
    PORT=${port} \\
    HOSTNAME=0.0.0.0

# ✅ Fix: بررسی وجود standalone و fallback
RUN echo "Checking for standalone output..." >&2
COPY --from=build /app/.next/standalone ./.next-standalone-tmp || true
RUN if [ -d /app/.next-standalone-tmp ]; then \\
        cp -r /app/.next-standalone-tmp/* /app/ && rm -rf /app/.next-standalone-tmp; \\
    else \\
        echo "Warning: .next/standalone not found. Ensure next.config.js has output: 'standalone'" >&2; \\
    fi

COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.* ./
RUN npm cache clean --force 2>/dev/null || true
${isAlpineUser}
USER appuser
${ociLabels}
EXPOSE ${port}${debugExpose}${healthCheck}

# ✅ Fix: fallback به next start اگه standalone نبود
CMD ["sh", "-c", "if [ -f server.js ]; then exec node server.js; else exec npx next start -p ${port}; fi"]`;
		}
	}

	// ⬇️ عیناً کپی از DockerfileGenerator اصلی
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

	// ⬇️ عیناً کپی از DockerfileGenerator اصلی
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
