import { colorize } from "#internal/color";

export type ConfirmOptions = {
  defaultYes?: boolean;
  assumeYes?: boolean;
};

// Confirms a destructive action. Non-interactive runs require --yes/assumeYes,
// otherwise the action is refused to avoid silent data loss.
export async function confirm(
  question: string,
  options: ConfirmOptions = {},
): Promise<boolean> {
  if (options.assumeYes) {
    return true;
  }

  if (!process.stdin.isTTY) {
    return false;
  }

  const suffix = options.defaultYes ? "[Y/n]" : "[y/N]";
  process.stdout.write(`${colorize("?", "yellow")} ${question} ${suffix} `);

  for await (const line of console) {
    const answer = line.trim().toLowerCase();

    if (answer === "") {
      return Boolean(options.defaultYes);
    }

    if (answer === "y" || answer === "yes") {
      return true;
    }

    if (answer === "n" || answer === "no") {
      return false;
    }

    process.stdout.write(`${colorize("?", "yellow")} Please answer y or n. `);
  }

  return false;
}
