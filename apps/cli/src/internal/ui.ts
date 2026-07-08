import { colorize } from "#internal/color";

export function heading(title: string): void {
  process.stdout.write(`\n${colorize(`▸ ${title}`, "bold", "cyan")}\n`);
}

export function step(message: string): void {
  process.stdout.write(`${colorize("•", "blue")} ${message}\n`);
}

export function ok(message: string): void {
  process.stdout.write(`${colorize("✓", "green")} ${message}\n`);
}

export function warn(message: string): void {
  process.stdout.write(`${colorize("!", "yellow")} ${message}\n`);
}

export function info(message: string): void {
  process.stdout.write(`${colorize("i", "gray")} ${message}\n`);
}

export function fail(message: string): void {
  process.stderr.write(`${colorize("✗", "red")} ${message}\n`);
}

export function plain(message = ""): void {
  process.stdout.write(`${message}\n`);
}

export function command(value: string): string {
  return colorize(value, "magenta");
}
