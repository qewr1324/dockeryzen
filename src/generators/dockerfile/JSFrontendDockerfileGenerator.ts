import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class JSFrontendDockerfileGenerator extends BaseDockerfileGenerator {
	protected getHealthCheckInstall(): string {
		if (!this.config.enableHealthCheck) return "";
		const framework = this.config.framework;

		if (framework === "angular") return "";

		const useAlpine = this.config.useAlpine;
		if (useAlpine) {
			return `\n# Install health check tools\nRUN apk add --no-cache ca-certificates curl\n`;
		}
		return `\n# Install health check tools\nRUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*\n`;
	}

	protected getHealthCheck(): string {
		if (!this.config.enableHealthCheck) return "";
		const port = this.config.port;
		const framework = this.config.framework;

		if (framework === "angular") {
			return `\n# Health check (SPA serves index.html at root)\nHEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\\n  CMD wget -q --spider http://localhost:${port}/ || exit 1`;
		}

		const healthPath = this.config.healthCheckPath || "/health";
		const primaryCheck = `curl -f http://localhost:${port}${healthPath}`;
		const fallbackCheck = `curl -f http://localhost:${port}/`;
		return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=5 \\\n  CMD ${primaryCheck} || ${fallbackCheck} || exit 1`;
	}

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

		// const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app";
		const userSetup = this.buildUserSetup();

		const lockFilesCopy = `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* bun.lockb* .npmrc* ./`;

		if (framework === "angular") {
			const projectName = this.config.projectName.replace(/[^a-zA-Z0-9-]/g, "-") || "app";
			return `# syntax=docker/dockerfile:1.4

${this.getHeader()}

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
EXPOSE ${port}${healthCheck}

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

# Verify .output exists
RUN if [ ! -d /app/.output ]; then \\
        echo "ERROR: .output not found!" >&2; \\
        echo "Nuxt 3 build failed to produce .output directory" >&2; \\
        exit 1; \\
    fi

# Runtime stage
FROM ${image}
WORKDIR /app
${healthCheckInstall}
ENV NODE_ENV=production \\
    PORT=${port} \\
    HOST=0.0.0.0 \\
    NUXT_TELEMETRY_DISABLED=1

# Copy only .output (self-contained)
COPY --from=build /app/.output ./.output

${userSetup}
USER appuser
${ociLabels}
EXPOSE ${port}${debugExpose}${healthCheck}

CMD ["node", ".output/server/index.mjs"]`;
		} else {
			return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${image} AS build
WORKDIR /app
${lockFilesCopy}
RUN --mount=type=cache,target=/root/.npm ${installCmd}
COPY . .
RUN npm run build

# Verify standalone exists — build fails if not
RUN if [ ! -d /app/.next/standalone ]; then \\
        echo "ERROR: .next/standalone not found!" >&2; \\
        echo "" >&2; \\
        echo "To fix this, add the following to your next.config.js:" >&2; \\
        echo "  const nextConfig = { output: 'standalone' };" >&2; \\
        exit 1; \\
    fi

# Runtime stage
FROM ${image}
WORKDIR /app
${healthCheckInstall}
ENV NODE_ENV=production \\
    PORT=${port} \\
    HOSTNAME=0.0.0.0

# Copy standalone output (includes node_modules needed)
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

${userSetup}
USER appuser
${ociLabels}
EXPOSE ${port}${debugExpose}${healthCheck}

CMD ["node", "server.js"]`;
		}
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
