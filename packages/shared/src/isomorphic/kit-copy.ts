import z from "zod";

/**
 * Where a piece of copy shows up, which is how the admin groups the fields.
 */
export const COPY_GROUPS = {
  landing: "Home screen",
  prompts: "Visit prompts",
  maintenance: "Maintenance screen",
  photoTicket: "Photo ticket",
  lotteryTicket: "Lottery ticket",
} as const;

export type CopyGroup = keyof typeof COPY_GROUPS;

export type CopyField = {
  group: CopyGroup;
  label: string;
  /** Keeps a line from overflowing its screen or the 576 px ticket. */
  maxLength: number;
  /** An optional line can be left empty, which hides it. */
  optional?: boolean;
  /** Placeholders the text may use, such as `{count}`. */
  variables?: readonly string[];
};

/**
 * Every piece of text a kit shows, shared by all kits so an event's edits
 * still apply after it switches kit. `**text**` renders bold.
 */
export const COPY_FIELDS = {
  "landing.poweredBy": {
    group: "landing",
    label: "Tagline under the logo",
    maxLength: 40,
    optional: true,
  },
  "landing.start": { group: "landing", label: "Start button", maxLength: 24 },
  "landing.lotteryTitle": {
    group: "landing",
    label: "Lottery panel title",
    maxLength: 20,
  },
  "landing.remainingPrizes": {
    group: "landing",
    label: "Prizes left",
    maxLength: 40,
    variables: ["count"],
  },
  "landing.totalAttempts": {
    group: "landing",
    label: "Attempts so far",
    maxLength: 40,
    optional: true,
    variables: ["count"],
  },
  "landing.legalNotice": {
    group: "landing",
    label: "Legal notice",
    maxLength: 60,
    optional: true,
  },
  "prompts.stayInFrame": {
    group: "prompts",
    label: "Before the photo",
    maxLength: 32,
  },
  "prompts.strikePose": {
    group: "prompts",
    label: "When the photo is taken",
    maxLength: 32,
  },
  "prompts.feelingLucky": {
    group: "prompts",
    label: "During the lottery draw",
    maxLength: 32,
  },
  "prompts.thatsIt": {
    group: "prompts",
    label: "After the draw",
    maxLength: 32,
  },
  "prompts.printing": {
    group: "prompts",
    label: "While printing",
    maxLength: 32,
  },
  "maintenance.title": {
    group: "maintenance",
    label: "Title",
    maxLength: 24,
  },
  "maintenance.body": {
    group: "maintenance",
    label: "Message",
    maxLength: 100,
    optional: true,
  },
  "photoTicket.venueName": {
    group: "photoTicket",
    label: "Venue name",
    maxLength: 28,
    optional: true,
  },
  "photoTicket.venueAddress": {
    group: "photoTicket",
    label: "Venue address",
    maxLength: 40,
    optional: true,
  },
  "photoTicket.itemsTitle": {
    group: "photoTicket",
    label: "Items heading",
    maxLength: 16,
  },
  "photoTicket.totalLabel": {
    group: "photoTicket",
    label: "Total label",
    maxLength: 12,
  },
  "photoTicket.socialPrompt": {
    group: "photoTicket",
    label: "Social line",
    maxLength: 28,
    optional: true,
  },
  "photoTicket.socialHandle": {
    group: "photoTicket",
    label: "Social handle",
    maxLength: 24,
    optional: true,
  },
  "photoTicket.thanks": {
    group: "photoTicket",
    label: "Thank-you line",
    maxLength: 32,
    optional: true,
  },
  "lotteryTicket.win": {
    group: "lotteryTicket",
    label: "Win banner",
    maxLength: 12,
  },
  "lotteryTicket.loss": {
    group: "lotteryTicket",
    label: "Loss banner",
    maxLength: 12,
  },
  "lotteryTicket.lossJoke": {
    group: "lotteryTicket",
    label: "Loss message",
    maxLength: 60,
    optional: true,
  },
} as const satisfies Record<string, CopyField>;

export type CopyKey = keyof typeof COPY_FIELDS;

export const COPY_KEYS = Object.keys(COPY_FIELDS) as CopyKey[];

/** The full text of a kit, one string per key. */
export type KitCopy = Record<CopyKey, string>;

function copyValueSchema(field: CopyField) {
  const text = z.string().trim().max(field.maxLength);
  return field.optional ? text : text.min(1);
}

/** An event's copy edits: only the keys it changes from the kit's text. */
export const kitCopyOverridesSchema = z
  .object(
    Object.fromEntries(
      COPY_KEYS.map((key) => [
        key,
        copyValueSchema(COPY_FIELDS[key]).optional(),
      ]),
    ) as Record<CopyKey, z.ZodOptional<z.ZodString>>,
  )
  .strict();

export type KitCopyOverrides = z.infer<typeof kitCopyOverridesSchema>;

/**
 * An event's stored copy edits, read one key at a time: a bad value (say,
 * from a newer release with a longer limit) is dropped on its own, so the
 * kit's text shows there without losing the event's other edits.
 */
export function readKitCopyOverrides(stored: unknown): {
  overrides: KitCopyOverrides;
  rejectedKeys: string[];
} {
  const overrides: KitCopyOverrides = {};
  const rejectedKeys: string[] = [];

  if (typeof stored !== "object" || stored === null) {
    return { overrides, rejectedKeys };
  }

  for (const [key, value] of Object.entries(stored)) {
    if (!(key in COPY_FIELDS)) {
      rejectedKeys.push(key);
      continue;
    }
    const copyKey = key as CopyKey;
    const parsed = copyValueSchema(COPY_FIELDS[copyKey]).safeParse(value);
    if (parsed.success) {
      overrides[copyKey] = parsed.data;
    } else {
      rejectedKeys.push(key);
    }
  }

  return { overrides, rejectedKeys };
}

/** Fills `{name}` placeholders; an unknown one is left as written. */
export function fillCopyVariables(
  text: string,
  values: Record<string, string | number>,
): string {
  return text.replace(/\{(\w+)\}/gu, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** The text without its `**` bold markers, for labels and alt text. */
export function plainCopyText(text: string): string {
  return text.replaceAll("**", "");
}
