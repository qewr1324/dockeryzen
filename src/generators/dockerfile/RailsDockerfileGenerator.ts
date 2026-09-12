import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class RailsDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
		const rubyVersion = this.config.rubyVersion || "3.3";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const port = this.config.port;

		let rubyImage = `ruby:${rubyVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === rubyVersion);
			if (versionConfig?.images) {
				if (this.config.useAlpine && versionConfig.images.alpine) rubyImage = versionConfig.images.alpine;
				else if (versionConfig.images.slim) rubyImage = versionConfig.images.slim;
				else rubyImage = versionConfig.images.standard;
			}
		}

		// ✅ FIX: userSetup — بدون chown (chown جداگانه انجام می‌شه)
		// ✅ FIX: -g root حذف شد (امنیت بهتر)
		const userSetup = this.config.useAlpine ? "RUN adduser -D -u 1001 -h /home/appuser appuser" : "RUN useradd -r -u 1001 -m -d /home/appuser appuser";

		const sidekiqInstall = this.config.enableSidekiq ? `\nRUN gem install sidekiq --no-document\n` : "";

		// ✅ FIX: mysql-dev → mariadb-dev, mysql-client → mariadb-client
		const buildDeps = this.config.useAlpine
			? "RUN apk add --no-cache build-base postgresql-dev mariadb-dev nodejs npm tzdata git yaml-dev"
			: "RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev default-libmysqlclient-dev nodejs npm tzdata git && rm -rf /var/lib/apt/lists/*";

		const runtimeDeps = this.config.useAlpine ? "RUN apk add --no-cache libpq mariadb-client tzdata" : "RUN apt-get update && apt-get install -y --no-install-recommends libpq5 default-libmysqlclient-dev tzdata && rm -rf /var/lib/apt/lists/*";

		const bundleConfig = `RUN bundle config set --local path 'vendor/bundle' && \\
    bundle config set --local without 'development test' && \\
    bundle config set --local deployment 'true'`;

		const bundleInstall = `RUN --mount=type=cache,target=/usr/local/bundle/cache \\
    bundle install --jobs 4 --retry 3`;

		return `# syntax=docker/dockerfile:1.4

${this.getHeader()}

# Build stage
FROM ${rubyImage} AS build
WORKDIR /app
${buildDeps}
COPY Gemfile Gemfile.lock* ./
${bundleConfig}
${bundleInstall}
COPY . .
RUN if [ -f Rakefile ] || [ -f config/application.rb ]; then \\
        RAILS_ENV=production bundle exec rake assets:precompile 2>&1 || \\
        (echo "Asset precompile skipped" && true); \\
    fi
RUN rm -rf tmp/cache tmp/pids log/*.log 2>/dev/null || true

# Runtime stage
FROM ${rubyImage}
WORKDIR /app
${healthCheckInstall}
${runtimeDeps}
COPY --from=build /app /app
${sidekiqInstall}
${userSetup}
RUN mkdir -p /app/tmp /app/log /app/storage && \\
    chown -R appuser:appuser /app
USER appuser
ENV RAILS_ENV=production \\
    RAILS_SERVE_STATIC_FILES=true \\
    RAILS_LOG_TO_STDOUT=true \\
    PORT=${port} \\
    BUNDLE_PATH=/app/vendor/bundle
${ociLabels}
EXPOSE ${port}${debugExpose}${healthCheck}
CMD ["sh", "-c", "if [ -f bin/rails ]; then bundle exec rails db:prepare 2>/dev/null || bundle exec rails db:migrate 2>/dev/null || true; fi; exec bundle exec puma -b tcp://0.0.0.0:${port} -e production"]`;
	}
}
