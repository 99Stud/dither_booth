import type { z } from "zod";

/*
 * The page's side of the admin server's action routes. Off the booth the
 * routes aren't served: the page fallback answers any path with the app's
 * HTML and a 200, so only the route's own JSON counts as an answer.
 */

/** The route's read, or null off the booth (404, or not its JSON). */
export async function fetchAdminJson<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  signal?: AbortSignal,
): Promise<z.infer<Schema> | null> {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    signal,
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`The admin server answered ${response.status}.`);
  }

  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? parsed.data : null;
}

/** An action's result, or a failure in the schema's own shape. */
export async function postAdminJson<Schema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: Schema,
  failure: (message: string) => z.infer<Schema>,
): Promise<z.infer<Schema>> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const parsed = schema.safeParse(
      await response.json().catch(() => undefined),
    );

    return parsed.success
      ? parsed.data
      : failure(`The admin server answered ${response.status}.`);
  } catch {
    return failure("Can't reach the admin server.");
  }
}
