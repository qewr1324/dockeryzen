import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class GenericDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const port = this.config.port;

		const packages = this.config.useAlpine ? "RUN apk add --no-cache build-base git curl wget" : "RUN apt-get update && apt-get install -y --no-install-recommends build-essential git curl wget && rm -rf /var/lib/apt/lists/*";

		return `# syntax=docker/dockerfile:1.4

FROM ${this.config.useAlpine ? "alpine:latest" : "ubuntu:22.04"}
WORKDIR /app
${healthCheckInstall}
${packages}
COPY . .
RUN set -eux; \\
    if [ -f Makefile ] || [ -f makefile ]; then make; \\
    elif [ -f CMakeLists.txt ]; then cmake -B build && cmake --build build; \\
    elif [ -f package.json ]; then npm install && (npm run build 2>/dev/null || true); \\
    elif [ -f requirements.txt ]; then pip install -r requirements.txt 2>/dev/null || true; \\
    else echo "No build system detected, skipping build step"; \\
    fi
${ociLabels}
EXPOSE ${port}${healthCheck}
CMD ["sh", "-c", "echo 'Please configure your application startup command'"]`;
	}
}
