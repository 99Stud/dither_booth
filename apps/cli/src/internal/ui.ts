import * as p from "@clack/prompts";

import { colorize } from "#internal/color";
import { getSession } from "#internal/session";
import { SilentExit } from "#internal/system";

export type ConfirmOptions = {
  defaultYes?: boolean;
  assumeYes?: boolean;
};

export function heading(title: string): void {
  p.log.step(title);
}

export function step(message: string): void {
  p.log.message(message, { symbol: colorize("•", "blue") });
}

export function ok(message: string): void {
  p.log.success(message);
}

export function warn(message: string): void {
  p.log.warn(message);
}

export function info(message: string): void {
  p.log.info(message);
}

export function fail(message: string): void {
  p.log.error(message);
}

export function plain(message = ""): void {
  process.stdout.write(`${message}\n`);
}

export function command(value: string): string {
  return colorize(value, "magenta");
}

export function intro(message: string): void {
  p.intro(message);
}

export function outro(message: string): void {
  p.outro(message);
}

// Confirms a destructive action. Non-interactive runs require --yes/assumeYes,
// otherwise the action is refused to avoid silent data loss.
export async function confirm(
  question: string,
  options: ConfirmOptions = {},
): Promise<boolean> {
  const assumeYes = options.assumeYes ?? getSession().assumeYes;

  if (assumeYes) {
    return true;
  }

  if (!process.stdin.isTTY) {
    return false;
  }

  const result = await p.confirm({
    message: question,
    initialValue: Boolean(options.defaultYes),
  });

  if (p.isCancel(result)) {
    p.cancel("Operation cancelled.");
    throw new SilentExit(0);
  }

  return result;
}

export async function withSpinner<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!process.stdout.isTTY) {
    step(label);
    return fn();
  }

  const spin = p.spinner();
  spin.start(label);

  try {
    const result = await fn();
    spin.stop(label);
    return result;
  } catch (error) {
    spin.stop(
      error instanceof Error ? `${label} failed: ${error.message}` : label,
    );
    throw error;
  }
}

// Runs a booth handler and maps SilentExit to process.exit so Citty does not
// print the internal "silent-exit" error object.
export async function runBoothTask(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    if (error instanceof SilentExit) {
      process.exit(error.exitCode);
    }

    throw error;
  }
}
