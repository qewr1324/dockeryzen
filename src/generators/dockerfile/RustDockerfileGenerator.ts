import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class RustDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
		const rustVersion = this.config.rustVersion || "latest";
		let buildImage = `rust:${rustVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === rustVersion);
			if (versionConfig) {
				if (this.config.useAlpine) {
					buildImage = versionConfig.buildAlpineImage || versionConfig.buildImage;
				} else {
					buildImage = versionConfig.buildSlimImage || versionConfig.buildImage;
				}
			}
		}

		const runtimeImage = this.config.useAlpine ? "alpine:latest" : "debian:bookworm-slim";
		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 -h /home/appuser appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root -m -d /home/appuser appuser && chown -R appuser:root /app";

		const ociLabels = this.getOciLabels();
		const healthCheckInstall = this.getHealthCheckInstall();

		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();

		const safeBinaryName = this.config.projectName.replace(/[^a-zA-Z0-9_-]/g, "_") || "app";

		const buildPackages = this.config.useAlpine ? "RUN apk add --no-cache musl-dev pkgconf openssl-dev openssl-libs-static" : "RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*";

		let runtimePackages = "";
		if (this.config.useAlpine) {
			runtimePackages = "RUN apk --no-cache add ca-certificates libgcc openssl";
		} else {
			runtimePackages = "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 libgcc-s1 && rm -rf /var/lib/apt/lists/*";
		}

		return `# syntax=docker/dockerfile:1.4

${this.getHeader()}

# Build stage
FROM ${buildImage} AS build
WORKDIR /app
${buildPackages}

COPY Cargo.toml Cargo.lock* ./
RUN mkdir -p src && \\
    if [ ! -f src/main.rs ] && [ ! -f src/lib.rs ]; then echo "fn main() {}" > src/main.rs; fi

RUN --mount=type=cache,target=/usr/local/cargo/registry \\
    --mount=type=cache,target=/app/target \\
    cargo build --release 2>/dev/null || true

COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \\
    --mount=type=cache,target=/app/target \\
    cargo build --release --locked 2>/dev/null || cargo build --release; \\
    BIN_NAME=$(grep -m1 '^name' Cargo.toml | sed 's/.*= *"\\(.*\\)"/\\1/'); \\
    if [ -z "$BIN_NAME" ]; then BIN_NAME="${safeBinaryName}"; fi; \\
    if [ -f "/app/target/release/$BIN_NAME" ]; then \\
        cp "/app/target/release/$BIN_NAME" /app/app-binary; \\
    else \\
        BIN=$(find /app/target/release -maxdepth 1 -type f -executable \\
            -not -name "*.d" -not -name "*.rlib" -not -name "*.so" \\
            -not -name "build-script-build" -not -name "*.dSYM" 2>/dev/null | head -n 1); \\
        if [ -z "$BIN" ]; then echo "No binary found!" && exit 1; fi; \\
        cp "$BIN" /app/app-binary; \\
    fi; \\
    chmod +x /app/app-binary

# Runtime stage
FROM ${runtimeImage}
WORKDIR /app
${runtimePackages}
${healthCheckInstall}
COPY --from=build /app/app-binary ./app
${isAlpineUser}
USER appuser
${ociLabels}
EXPOSE ${this.config.port}${debugExpose}${healthCheck}
CMD ["./app"]`;
	}
}
