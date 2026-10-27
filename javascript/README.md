# Free Store JavaScript Version

This is a JavaScript-only mirror of the backend and frontend. The original TypeScript project remains unchanged in the parent folders.

## Install and build

From this folder, run:

```sh
npm install
npm run build
```

## Run

```sh
npm run dev:backend
npm run dev:frontend
```

The backend reads its environment from `backend/.env`. Start it with `npm start`; run backend tests with `npm run test --workspace=backend`.

To regenerate the mirrored sources from the TypeScript project, run `node javascript/tools/transpile.cjs` from the repository root. This replaces the generated JavaScript source files. It requires the repository's TypeScript dependency.
