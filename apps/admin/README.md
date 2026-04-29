# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and oxlint.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Linting

This app uses oxlint for JavaScript, TypeScript, and React checks. The configuration lives in `oxlint.config.ts`.

Run `bun run lint` to check the app and `bun run lint:fix` to apply safe fixes.

## Formatting

Formatting uses oxfmt. Shared options live in the repository root `oxfmt.config.ts`.

Run `bun run format` to verify formatting and `bun run format:fix` to apply it.
