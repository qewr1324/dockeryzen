// @ts-check
import antfu from "@antfu/eslint-config";
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
	{
		ignores: ["dist", "src/generated"],
	},
	{
		files: ["**/*.{ts,js,mjs,cjs}"],
		languageOptions: {
			ecmaVersion: "latest",
			parser: tsParser,
			sourceType: "module",
		},
		plugins: {
			"@typescript-eslint": tseslint,
			antfu,
		},
		rules: {
			...js.configs.recommended.rules,
			...tseslint.configs.recommended.rules,
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
		},
	},
];
