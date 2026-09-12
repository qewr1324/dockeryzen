import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class DotNetDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
		const dotnetVersion = this.config.dotnetVersion || "8.0";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();

		let sdkImage = `mcr.microsoft.com/dotnet/sdk:${dotnetVersion}`;
		let aspnetImage = `mcr.microsoft.com/dotnet/aspnet:${dotnetVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === dotnetVersion);
			if (versionConfig) {
				sdkImage = versionConfig.sdkImage || sdkImage;
				aspnetImage = this.config.useAlpine ? versionConfig.aspnetAlpineImage || versionConfig.aspnetImage : versionConfig.aspnetImage;
			}
		}

		const safeProjectName = this.config.projectName.replace(/[^a-zA-Z0-9_]/g, "_");
		// const userSetup = this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app";
		// const userSetup = this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 appuser && chown -R appuser:appuser /app";
		const userSetup = this.buildUserSetup();

		const port = this.config.port;

		return `# syntax=docker/dockerfile:1.4

${this.getHeader()}

# Build stage
FROM ${sdkImage} AS build
WORKDIR /app

COPY *.csproj ./
COPY *.sln* ./
COPY NuGet.config* nuget.config* ./

RUN --mount=type=cache,target=/root/.nuget/packages \\
    dotnet restore

COPY . .

RUN --mount=type=cache,target=/root/.nuget/packages \\
    mkdir -p out && \\
    dotnet publish -c Release -o out --no-restore || \\
    dotnet publish -c Release -o out

# Runtime stage
FROM ${aspnetImage}
WORKDIR /app
${healthCheckInstall}
COPY --from=build /app/out .

RUN mkdir -p /app/logs /app/tmp

${userSetup}
USER appuser

ENV ASPNETCORE_URLS=http://+:${port} \\
    ASPNETCORE_ENVIRONMENT=Production \\
    DOTNET_RUNNING_IN_CONTAINER=true \\
    DOTNET_NOLOGO=true \\
    DOTNET_CLI_TELEMETRY_OPTOUT=true

${ociLabels}

EXPOSE ${port}${debugExpose}${healthCheck}

ENTRYPOINT ["sh", "-c", "APP_DLL=$(find . -maxdepth 1 -name '*.dll' -not -name '*.resources.dll' | head -n 1); if [ -z \\"$APP_DLL\\" ]; then echo 'ERROR: No DLL found!' && exit 1; fi; exec dotnet \\"$APP_DLL\\""]`;
	}
}
