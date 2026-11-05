/**
 * Proves the brief's fourth rule: no AI inside the app.
 *
 * Fails if any dependency is an AI SDK, if any source file imports one or
 * calls a model API, or if any environment variable name looks like an AI key.
 * Run with `npm run check:no-ai`; it is part of `npm run verify`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const AI_PACKAGES = [
  /^@anthropic-ai\//, /^openai$/, /^@openai\//, /^ai$/, /^@ai-sdk\//, /^@google\/(generative-ai|genai)/,
  /^@google-cloud\/vertexai/, /^@mistralai\//, /^cohere-ai$/, /^groq-sdk$/, /^ollama$/, /^langchain/, /^@langchain\//,
  /^llamaindex$/, /^replicate$/, /^@huggingface\//, /^together-ai$/,
];
const AI_SOURCE = [
  /from ["'](@anthropic-ai|openai|@ai-sdk|@google\/genai|@google\/generative-ai|langchain|@langchain)/,
  /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.cohere\.ai/,
  /process\.env\.(ANTHROPIC|OPENAI|GEMINI|GOOGLE_AI|MISTRAL|COHERE|GROQ|AI_GATEWAY)\w*/,
];
const AI_ENV = /^(ANTHROPIC|OPENAI|GEMINI|GOOGLE_(AI|GENAI)|MISTRAL|COHERE|GROQ|TOGETHER|REPLICATE|HUGGINGFACE|AI_GATEWAY)\w*/;

const root = process.cwd();
const problems: string[] = [];

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
  if (AI_PACKAGES.some((re) => re.test(name))) problems.push(`package.json depends on ${name}`);
}

function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", ".vercel", "public"].includes(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry) && !path.endsWith("no-ai-check.ts")) {
      const text = readFileSync(path, "utf8");
      for (const re of AI_SOURCE) if (re.test(text)) problems.push(`${path.replace(root + "/", "")} matches ${re}`);
    }
  }
}
walk(root);

for (const file of [".env", ".env.local", ".env.example"]) {
  try {
    for (const line of readFileSync(join(root, file), "utf8").split("\n")) {
      const key = line.split("=")[0].trim();
      if (AI_ENV.test(key)) problems.push(`${file} defines ${key}`);
    }
  } catch {
    // file not present
  }
}

if (problems.length) {
  console.error("AI found inside the app:\n" + problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}
console.log(`No AI inside: ${Object.keys(pkg.dependencies).length} dependencies, every source file and the env files checked. Claude is reached only from the outside, over MCP.`);
