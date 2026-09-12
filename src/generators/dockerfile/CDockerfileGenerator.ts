import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class CDockerfileGenerator extends BaseDockerfileGenerator {
	protected getHealthCheckInstall(): string {
		return "";
	}

	generate(): string {
		const gccVersion = this.config.gccVersion || "13";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const ociLabels = this.getOciLabels();

		let gccImage = `gcc:${gccVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === gccVersion);
			if (versionConfig) {
				if (this.config.useAlpine && versionConfig.alpineImage) gccImage = versionConfig.alpineImage;
				else gccImage = versionConfig.image;
			}
		}

		const runtimeImage = this.config.useAlpine ? "alpine:latest" : "debian:bookworm-slim";
		const userSetup = this.buildUserSetup();

		const buildPackages = this.config.useAlpine ? "RUN apk add --no-cache cmake make gcc musl-dev" : "RUN apt-get update && apt-get install -y --no-install-recommends cmake make gcc libc6-dev && rm -rf /var/lib/apt/lists/*";

		const runtimePackages = this.config.useAlpine ? "RUN apk --no-cache add libgcc curl ca-certificates netcat-openbsd" : "RUN apt-get update && apt-get install -y --no-install-recommends libc6 curl ca-certificates netcat-openbsd && rm -rf /var/lib/apt/lists/*";

		const buildStep = `RUN set -eux; \\
    if [ -f CMakeLists.txt ]; then \\
        cmake -B build -DCMAKE_BUILD_TYPE=Release; \\
        cmake --build build -j"$(nproc)"; \\
    elif [ -f Makefile ] || [ -f makefile ]; then \\
        make -j"$(nproc)"; \\
    elif [ -f main.c ]; then \\
        gcc -O2 -std=c11 -o app main.c; \\
    elif [ -f src/main.c ]; then \\
        gcc -O2 -std=c11 -o app src/main.c; \\
    else \\
        echo "No CMakeLists.txt, Makefile, or main.c found!" && exit 1; \\
    fi; \\
    BIN=$(find /app /app/build /app/bin /app/src -maxdepth 3 -type f -executable \\
        -not -name "*.so" -not -name "*.o" -not -name "*.a" \\
        -not -name "*.cmake" -not -name "Makefile" \\
        -not -path "*/CMakeFiles/*" -not -path "*/.git/*" 2>/dev/null | head -n 1); \\
    if [ -z "$BIN" ]; then echo "No executable produced!" && exit 1; fi; \\
    cp "$BIN" /app/app-binary; \\
    chmod +x /app/app-binary`;

		return `# syntax=docker/dockerfile:1.4

${this.getHeader()}

# Build stage
FROM ${gccImage} AS build
WORKDIR /app
${buildPackages}
COPY . .
${buildStep}

# Runtime stage
FROM ${runtimeImage}
WORKDIR /app
${runtimePackages}
COPY --from=build /app/app-binary ./app
${userSetup}
USER appuser
${ociLabels}
EXPOSE ${this.config.port}${debugExpose}${healthCheck}
CMD ["./app"]`;
	}
}
