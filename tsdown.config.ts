import { execFileSync } from "node:child_process";
import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/extension.ts"],
	format: ["cjs"],
	shims: false,
	dts: false,
	external: ["vscode"],
	hooks(hooks) {
		hooks.hookOnce("build:prepare", () => {
			execFileSync("bun", ["run", "update"], { stdio: "inherit" });
		});
	},
});
