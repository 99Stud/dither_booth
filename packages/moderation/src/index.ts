import frenchBadwordsList from "french-badwords-list";
import {
  DataSet,
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
  parseRawPattern,
} from "obscenity";

import { BLOCKED_EXTREMISM_NAMES } from "./blocked-extremism-names.ts";

export const TICKET_NAME_MODERATION_MESSAGE = "Ce nom ne peut pas être utilisé sur le ticket.";
export const MAX_TICKET_NAMES = 5;
export const MAX_TICKET_NAME_LENGTH = 80;

export const sanitizeTicketNameInput = (value: string) => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\|/g, " ")
    .replace(/[^A-Z ]/g, "")
    .replace(/\s+/g, " ")
    .trimStart()
    .slice(0, MAX_TICKET_NAME_LENGTH);
};

const importedFrenchPatterns = [
  ...new Set(
    frenchBadwordsList.array
      .map((word) => sanitizeTicketNameInput(word).trim().toLowerCase())
      .filter(Boolean),
  ),
].map((word) => {
  return parseRawPattern(`|${word}|`);
});

const extremismPatterns = BLOCKED_EXTREMISM_NAMES.map((entry) => {
  return parseRawPattern(`|${sanitizeTicketNameInput(entry).trim().toLowerCase()}|`);
});

const frenchDataset = new DataSet<{ originalWord: string }>()
  .addAll(englishDataset)
  .addPhrase((phrase) => {
    let next = phrase.setMetadata({ originalWord: "blocked-extremism-names" });

    for (const extremismPattern of extremismPatterns) {
      next = next.addPattern(extremismPattern);
    }

    return next;
  })
  .addPhrase((phrase) => {
    let next = phrase.setMetadata({ originalWord: "french-badwords-list" });

    for (const importedPattern of importedFrenchPatterns) {
      next = next.addPattern(importedPattern);
    }

    return next;
  });

const matcher = new RegExpMatcher({
  ...frenchDataset.build(),
  ...englishRecommendedTransformers,
});

export class TicketNameModerationError extends Error {
  constructor() {
    super(TICKET_NAME_MODERATION_MESSAGE);
    this.name = "TicketNameModerationError";
  }
}

export const isTicketNameAllowed = (name: string) => {
  const candidate = sanitizeTicketNameInput(name).trim();
  if (candidate.length === 0) {
    return true;
  }

  return !matcher.hasMatch(candidate);
};

export const validateTicketNames = (names: string[]) => {
  const hasBlockedName = names.some((name) => !isTicketNameAllowed(name));

  if (hasBlockedName) {
    return {
      message: TICKET_NAME_MODERATION_MESSAGE,
      ok: false as const,
    };
  }

  return {
    ok: true as const,
  };
};

export const assertTicketNames = (names: string[]) => {
  const result = validateTicketNames(names);

  if (!result.ok) {
    throw new TicketNameModerationError();
  }
};
