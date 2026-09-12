import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class GoDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
		const goVersion = this.config.goVersion || "1.21";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const cgoEnabled = this.config.cgoEnabled !== false;

		let buildImage = `golang:${goVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === goVersion);
			if (versionConfig) {
				buildImage = this.config.useAlpine ? versionConfig.alpineImage || versionConfig.image : versionConfig.image;
			}
		}

		const runtimeBase = this.config.useAlpine ? "alpine:latest" : "debian:bookworm-slim";
		const cgoFlag = cgoEnabled ? "1" : "0";
		// const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 -h /home/appuser appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root -m -d /home/appuser appuser && chown -R appuser:root /app";
		const userSetup = this.buildUserSetup();

		const cgoPackages = this.config.useAlpine && cgoEnabled ? "RUN apk add --no-cache gcc musl-dev" : "";
		const cgoPackagesDebian = !this.config.useAlpine && cgoEnabled ? "RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev && rm -rf /var/lib/apt/lists/*" : "";
		const buildPackages = cgoPackages || cgoPackagesDebian;

		let runtimePackages = "";
		if (this.config.useAlpine) {
			const pkgs = ["ca-certificates", "tzdata", "curl", "wget"];
			if (cgoEnabled) pkgs.push("libc6-compat");
			runtimePackages = `RUN apk --no-cache add ${pkgs.join(" ")}`;
		} else {
			runtimePackages = "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata curl wget && rm -rf /var/lib/apt/lists/*";
		}

		const ldflags = "-s -w -X main.version=1.0.0";

		const modDownload = `RUN --mount=type=cache,target=/go/pkg/mod \\
    if [ ! -f go.sum ]; then go mod tidy; fi && \\
    go mod download`;

		return `# syntax=docker/dockerfile:1.4

${this.getHeader()}

# Build stage
FROM ${buildImage} AS build
WORKDIR /app
${buildPackages}
COPY go.mod go.sum* ./
${modDownload}
COPY . .
RUN CGO_ENABLED=${cgoFlag} GOOS=linux GOARCH=$(go env GOARCH) \\
    go build -a -ldflags="${ldflags}" -o main . 2>/dev/null || \\
    CGO_ENABLED=${cgoFlag} GOOS=linux go build -a -o main .

# Runtime stage
FROM ${runtimeBase}
WORKDIR /app
${runtimePackages}
${healthCheckInstall}
COPY --from=build /app/main .
${userSetup}
USER appuser
${ociLabels}
EXPOSE ${this.config.port}${debugExpose}${healthCheck}
CMD ["./main"]`;
	}
}
