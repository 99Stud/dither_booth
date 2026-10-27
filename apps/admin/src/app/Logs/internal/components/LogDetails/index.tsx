import type { FC, ReactNode } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import clsx from "clsx";
import { Braces, Copy } from "lucide-react";

import type { LogEntry } from "#lib/logs/logs.types";

import {
  copyLogText,
  formatLogTime,
  getLogServiceLabel,
} from "../../Logs.utils";
import { LOG_SERVICE_LABELS } from "../../Logs.constants";
import { LogLevelLabel } from "../LogLevelLabel";

const PRE_CLASS_NAME = clsx(
  "max-h-80 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs",
  "leading-relaxed break-all whitespace-pre-wrap",
);

const Section: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <section className={clsx("flex min-w-0 flex-col gap-1.5")}>
    <h3 className={clsx("text-xs font-medium text-muted-foreground")}>
      {title}
    </h3>
    {children}
  </section>
);

const Field: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  <div className={clsx("flex min-w-0 gap-3")}>
    <dt className={clsx("w-20 shrink-0 text-muted-foreground")}>{label}</dt>
    <dd className={clsx("min-w-0 font-mono break-all")}>{children}</dd>
  </div>
);

/**
 * Everything one line holds: its fields, details, error and raw text, with
 * buttons to copy it. Shown under the line, or in a sheet on phones.
 */
export const LogDetails: FC<{ entry: LogEntry }> = ({ entry }) => (
  <div className={clsx("flex flex-col gap-4 text-xs")}>
    <dl className={clsx("grid gap-1 sm:grid-cols-2 sm:gap-x-6")}>
      <Field label="Time">
        {formatLogTime(entry.timestamp)}{" "}
        <span className={clsx("text-muted-foreground")}>{entry.timestamp}</span>
      </Field>
      <Field label="Service">{getLogServiceLabel(entry)}</Field>
      {entry.origin === "browser" && (
        <Field label="Received by">{LOG_SERVICE_LABELS[entry.service]}</Field>
      )}
      <Field label="Level">
        <LogLevelLabel level={entry.level} />
      </Field>
      <Field label="Stream">{entry.stream}</Field>
      {entry.source && <Field label="Source">{entry.source}</Field>}
      {entry.event && <Field label="Event">{entry.event}</Field>}
      {entry.deviceId && <Field label="Device">{entry.deviceId}</Field>}
      {entry.runId !== undefined && <Field label="Run">{entry.runId}</Field>}
    </dl>
    {entry.error && (
      <Section title="Error">
        <pre className={PRE_CLASS_NAME}>
          {[
            entry.error.name
              ? `${entry.error.name}: ${entry.error.message}`
              : entry.error.message,
            entry.error.cause && `Cause: ${entry.error.cause}`,
            entry.error.stack,
          ]
            .filter(Boolean)
            .join("\n\n")}
        </pre>
      </Section>
    )}
    {entry.details && Object.keys(entry.details).length > 0 && (
      <Section title="Details">
        <pre className={PRE_CLASS_NAME}>
          {JSON.stringify(entry.details, null, 2)}
        </pre>
      </Section>
    )}
    <Section title="Raw line">
      <pre className={PRE_CLASS_NAME}>{entry.raw}</pre>
    </Section>
    <div className={clsx("flex flex-wrap gap-2")}>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          void copyLogText(JSON.stringify(entry, null, 2), "JSON copied.")
        }
      >
        <Braces />
        Copy JSON
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void copyLogText(entry.raw, "Line copied.")}
      >
        <Copy />
        Copy line
      </Button>
    </div>
  </div>
);
