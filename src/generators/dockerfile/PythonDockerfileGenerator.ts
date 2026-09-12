import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class PythonDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
		const pythonVersion = this.config.pythonVersion || "3.11";
		const image = this.getPythonImage(pythonVersion);
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const framework = this.config.framework;
		const useVirtualEnv = this.config.useVirtualEnv;
		const useGunicorn = this.config.enableGunicorn;
		const port = this.config.port;

		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app";

		const buildDeps = this.config.useAlpine ? "RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev zlib-dev jpeg-dev freetype-dev lcms2-dev" : "RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev default-libmysqlclient-dev libjpeg-dev && rm -rf /var/lib/apt/lists/*";

		const runtimeDeps = this.config.useAlpine ? "RUN apk add --no-cache libffi openssl zlib jpeg freetype lcms2" : "RUN apt-get update && apt-get install -y --no-install-recommends libpq5 default-libmysqlclient-dev libjpeg62-turbo && rm -rf /var/lib/apt/lists/*";

		let extraPackages = "";
		if (useGunicorn || framework === "django" || framework === "flask") {
			extraPackages = "gunicorn";
		}
		if (framework === "fastapi") {
			extraPackages = extraPackages ? `${extraPackages} "uvicorn[standard]"` : '"uvicorn[standard]" gunicorn';
		}

		const projectModule = this.config.projectName.replace(/[^a-zA-Z0-9_]/g, "_") || "app";

		let startCmd = 'CMD ["python", "app.py"]';
		if (framework === "django") {
			if (useGunicorn) {
				startCmd = `CMD ["sh", "-c", "if [ -f wsgi.py ]; then exec gunicorn --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --timeout 120 wsgi:application; fi; \\
    WSGI_PATH=$(find . -maxdepth 2 -name wsgi.py -not -path './wsgi.py' | head -n 1); \\
    if [ -n \\"$WSGI_PATH\\" ]; then \\
        MODULE=$(echo \\"$WSGI_PATH\\" | sed 's|^\\\\./||; s|/|.|g; s|\\\\.py$||'); \\
        exec gunicorn --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --timeout 120 \\"$MODULE:application\\"; \\
    fi; \\
    if [ -f ${projectModule}/wsgi.py ]; then exec gunicorn --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --timeout 120 ${projectModule}.wsgi:application; fi; \\
    echo 'No wsgi.py found!' && exit 1"]`;
			} else {
				startCmd = `CMD ["sh", "-c", "echo 'No wsgi.py found!' && exit 1"]`;
			}
		} else if (framework === "flask") {
			if (useGunicorn) {
				startCmd = `CMD ["sh", "-c", "if [ -f wsgi.py ]; then exec gunicorn --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --timeout 120 wsgi:app; elif [ -f app.py ]; then exec gunicorn --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --timeout 120 app:app; elif [ -f main.py ]; then exec gunicorn --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --timeout 120 main:app; else exec flask run --host=0.0.0.0 --port=${port}; fi"]`;
			} else {
				startCmd = `CMD ["flask", "run", "--host=0.0.0.0", "--port=${port}"]`;
			}
		} else if (framework === "fastapi") {
			if (useGunicorn) {
				startCmd = `CMD ["sh", "-c", "if [ -f main.py ]; then exec gunicorn main:app --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --worker-class uvicorn.workers.UvicornWorker --timeout 120; elif [ -f app.py ]; then exec gunicorn app:app --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --worker-class uvicorn.workers.UvicornWorker --timeout 120; else exec uvicorn main:app --host 0.0.0.0 --port ${port} --workers ${"$"}{WORKERS}; fi"]`;
			} else {
				startCmd = `CMD ["sh", "-c", "if [ -f main.py ]; then exec uvicorn main:app --host 0.0.0.0 --port ${port} --workers ${"$"}{WORKERS} --loop uvloop --http httptools; elif [ -f app.py ]; then exec uvicorn app:app --host 0.0.0.0 --port ${port} --workers ${"$"}{WORKERS} --loop uvloop --http httptools; else exec uvicorn main:app --host 0.0.0.0 --port ${port} --workers ${"$"}{WORKERS}; fi"]`;
			}
		}

		return `# syntax=docker/dockerfile:1.4

${this.getHeader()}

# Build stage
FROM ${image} AS build
WORKDIR /app
${buildDeps}
COPY requirements.txt* pyproject.toml* setup.py* ./
RUN --mount=type=cache,target=/root/.cache/pip \\
    if [ -f requirements.txt ]; then \\
        pip install --no-cache-dir --prefix=/install -r requirements.txt; \\
    elif [ -f pyproject.toml ]; then \\
        pip install --no-cache-dir --prefix=/install .; \\
    elif [ -f setup.py ]; then \\
        pip install --no-cache-dir --prefix=/install .; \\
    fi
${extraPackages ? `RUN pip install --no-cache-dir --prefix=/install ${extraPackages}` : ""}

# Runtime stage
FROM ${image}
WORKDIR /app
${healthCheckInstall}
${runtimeDeps}
COPY --from=build /install /usr/local
COPY . .
RUN find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
${isAlpineUser}
USER appuser
ENV PYTHONUNBUFFERED=1 \\
    PYTHONDONTWRITEBYTECODE=1 \\
    PORT=${port} \\
    WORKERS=4
${ociLabels}
EXPOSE ${port}${debugExpose}${healthCheck}
${startCmd}`;
	}

	// ⬇️ عیناً کپی از DockerfileGenerator اصلی
	private getPythonImage(version: string): string {
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === version);
			if (versionConfig?.images) {
				if (this.config.useAlpine && versionConfig.images.alpine) return versionConfig.images.alpine;
				if (versionConfig.images.slim) return versionConfig.images.slim;
				if (versionConfig.images.standard) return versionConfig.images.standard;
			}
		}
		return `python:${version}${this.config.useAlpine ? "-alpine" : "-slim"}`;
	}
}
