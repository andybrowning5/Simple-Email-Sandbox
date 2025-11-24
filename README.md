# Agent Email MCP — TypeScript Starter

Minimal TypeScript project scaffold.

Quick start

1. Install dependencies:

```bash
npm install
```

2. Development (auto-restart):

```bash
npm run dev
```

3. Build and run:

```bash
npm run build
npm start
```

4. Run tests:

```bash
npm test
```

Docker

Build and run with Docker (node:20-slim base):

```bash
docker build -t agent-email-mcp .
docker run --rm agent-email-mcp
```

Files created
- `package.json` — scripts & devDependencies
- `tsconfig.json` — TypeScript config
- `src/index.ts` — app entry
- `src/utils/greet.ts` — sample export
- `test/sample.test.ts` — vitest sample test
- `.gitignore`

Next steps
- Run `npm install` to install dev dependencies.
- Optionally add `eslint` / `prettier` if you want linting and formatting.
