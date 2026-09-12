import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class CppDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
		const gccVersion = this.config.gccVersion || "13";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
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
		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 -h /home/appuser appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root -m -d /home/appuser appuser && chown -R appuser:root /app";

		const buildPackages = this.config.useAlpine ? "RUN apk add --no-cache cmake make g++ musl-dev" : "RUN apt-get update && apt-get install -y --no-install-recommends cmake make g++ && rm -rf /var/lib/apt/lists/*";

		const runtimePackages = this.config.useAlpine ? "RUN apk --no-cache add libstdc++ libgcc" : "RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && rm -rf /var/lib/apt/lists/*";

		const buildStep = `RUN set -eux; \\
    if [ -f CMakeLists.txt ]; then \\
        cmake -B build -DCMAKE_BUILD_TYPE=Release; \\
        cmake --build build -j"$(nproc)"; \\
    elif [ -f Makefile ] || [ -f makefile ]; then \\
        make -j"$(nproc)"; \\
    elif [ -f main.cpp ]; then \\
        g++ -O2 -std=c++17 -o app main.cpp; \\
    elif [ -f src/main.cpp ]; then \\
        g++ -O2 -std=c++17 -o app src/main.cpp; \\
    else \\
        echo "No CMakeLists.txt, Makefile, or main.cpp found!" && exit 1; \\
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
${healthCheckInstall}
COPY --from=build /app/app-binary ./app
${isAlpineUser}
USER appuser
${ociLabels}
EXPOSE ${this.config.port}${debugExpose}${healthCheck}
CMD ["./app"]`;
	}
}
