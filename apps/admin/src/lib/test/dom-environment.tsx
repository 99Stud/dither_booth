import { GlobalRegistrator } from "@happy-dom/global-registrator";

/*
 * The browser for render tests: happy-dom's `window`, `document` and friends
 * on the global object. `bun run test:render` preloads it, so it exists
 * before React DOM and Testing Library load. It also replaces `fetch`,
 * `Response`, `WebSocket` and other server globals, so `bun run test:unit`
 * never loads it: the route and server tests need Bun's own.
 */
GlobalRegistrator.register({ url: "https://localhost:3002/" });
