# Package Design Guidelines

Packages in this workspace should make their public API explicit, keep private
implementation details private, and make runtime constraints visible from file
paths and import paths.

## Public APIs

Use `package.json` `exports` as the package's public contract. Other packages
must import only exported subpaths.

```json
{
  "exports": {
    "./routes": "./src/isomorphic/routes.ts",
    "./browser/storage": "./src/browser/storage.ts",
    "./server/paths": "./src/server/paths.ts"
  }
}
```

Prefer explicit subpaths and explicit filenames. Avoid public catch-all
`index.ts` files because they make APIs harder to find by filename and encourage
unreviewed re-export growth.

Good:

```ts
import { RECEIPT_VIEWER_PATH } from "@dither-booth/shared/routes";
```

Avoid:

```ts
import { RECEIPT_VIEWER_PATH } from "@dither-booth/shared/src/routes";
```

## Private Imports

Use `package.json` `imports` for package-private aliases. These aliases are
only valid inside the package that declares them and should point at source
files that are not part of the external API.

```json
{
  "imports": {
    "#browser/*": "./src/browser/*.ts",
    "#internal/*": "./src/internal/*.ts",
    "#isomorphic/*": "./src/isomorphic/*.ts",
    "#server/*": "./src/server/*.ts"
  }
}
```

Prefer scoped private aliases over broad aliases such as `#*`. Scoped aliases
make package structure and runtime boundaries visible at every import site.

## `exports`, `imports`, And `tsconfig` `paths`

`exports` and `imports` are package metadata. They affect TypeScript resolution
and runtime or bundler resolution when using modern module resolution.

`tsconfig.json` `paths` is a TypeScript-only remapping feature. It does not
define a package API, and it can bypass `package.json` metadata. Do not use
`paths` to simulate workspace package imports. If a package needs to expose a
module, add an `exports` entry. If code inside a package needs a private alias,
add an `imports` entry.

Only use `paths` for local tooling cases where the runtime or bundler is also
configured to resolve the same specifier.

## Runtime Scopes

Separate source files by the runtime they are allowed to use.

- `src/isomorphic/*`: safe for browser and server consumers. Avoid `document`,
  `window`, Bun, Node built-ins, filesystem access, and process env reads.
- `src/browser/*`: browser-only code. DOM, localStorage, canvas, Blob, and
  window APIs belong here.
- `src/server/*`: server-only code. Bun globals, Node built-ins, filesystem
  paths, process env, and server startup validation belong here.
- `src/internal/*`: implementation helpers that are not exported to other
  packages.

Reflect those scopes in public exports:

```json
{
  "exports": {
    "./formatting": "./src/isomorphic/formatting.ts",
    "./browser/blob": "./src/browser/blob.ts",
    "./server/runtime": "./src/server/runtime.ts"
  }
}
```

## Typechecking Boundaries

Reusable packages should typecheck each runtime scope with the narrowest useful
global environment.

- Isomorphic configs should not include Bun or full DOM globals unless the file
  truly requires a cross-runtime Web API.
- Browser configs should include DOM globals and exclude Bun-only test globals.
- Server configs should include Bun or Node globals and exclude DOM globals.
- Test configs may use broader globals, but those should not leak into
  production source checks.

## Adding Or Changing Package APIs

Before adding a module to a package:

1. Decide whether the module is public or private.
2. Decide whether it is isomorphic, browser-only, or server-only.
3. Place it in the matching source directory with an explicit filename.
4. Add a `package.json` `exports` entry only if another package should import it.
5. Use package-private `imports` aliases for internal cross-file imports.
6. Update all consumers to import through the package's public subpaths.
7. Run the package's lint, format, and typecheck scripts.
