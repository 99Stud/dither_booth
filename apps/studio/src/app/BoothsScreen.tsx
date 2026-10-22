import type { FormEvent } from "react";

import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Badge } from "@dither-booth/ui/components/ui/badge";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Field, FieldLabel } from "@dither-booth/ui/components/ui/field";
import { Input } from "@dither-booth/ui/components/ui/input";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { format } from "date-fns";
import { CalendarClock, Copy, KeyRound, Plus, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  addBooth,
  type BoothRow,
  CONDITION_LABEL,
  issueRegistrationCode,
  listBooths,
  reportLine,
  type RegistrationCode,
  setLiveWindow,
} from "#lib/booths";
import { staffOrgId } from "#lib/device";
import { useLive } from "#lib/live";

const messageOf = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Something went wrong.";

/** A datetime-local input's value, in this device's time zone. */
const toLocalInput = (iso: string | null) =>
  iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "";

const EventWindow = ({
  booth,
  onSaved,
}: {
  booth: BoothRow;
  onSaved: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState(toLocalInput(booth.liveFrom));
  const [until, setUntil] = useState(toLocalInput(booth.liveUntil));
  const [busy, setBusy] = useState(false);

  const save = async (window: {
    from: string | null;
    until: string | null;
  }) => {
    setBusy(true);
    try {
      await setLiveWindow(booth.id, window.from, window.until);
      toast.success(
        window.from ? "Event times saved." : "Event times cleared.",
      );
      setEditing(false);
      onSaved();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!from || !until) return;
    void save({
      from: new Date(from).toISOString(),
      until: new Date(until).toISOString(),
    });
  };

  return (
    <div className={clsx("flex flex-col gap-2")}>
      <p className={clsx("flex items-start gap-2 text-sm")}>
        <CalendarClock
          aria-hidden
          className={clsx("mt-0.5 size-4 shrink-0 text-muted-foreground")}
        />
        {booth.liveFrom && booth.liveUntil
          ? `Event on ${format(new Date(booth.liveFrom), "EEE d MMM HH:mm")} to ${format(new Date(booth.liveUntil), "EEE d MMM HH:mm")}: a silent booth is an alert then.`
          : "No event times: a silent booth is never an alert."}
      </p>
      {editing ? (
        <form className={clsx("flex flex-col gap-3")} onSubmit={submit}>
          <div className={clsx("grid gap-3 sm:grid-cols-2")}>
            <Field>
              <FieldLabel htmlFor={`from-${booth.id}`}>Starts</FieldLabel>
              <Input
                id={`from-${booth.id}`}
                type="datetime-local"
                required
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`until-${booth.id}`}>Ends</FieldLabel>
              <Input
                id={`until-${booth.id}`}
                type="datetime-local"
                required
                min={from}
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            </Field>
          </div>
          <div className={clsx("flex flex-wrap gap-2")}>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !from || !until || until <= from}
            >
              Save
            </Button>
            {booth.liveFrom ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void save({ from: null, until: null })}
              >
                Clear
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={clsx("self-start")}
          onClick={() => setEditing(true)}
        >
          {booth.liveFrom ? "Change event times" : "Set event times"}
        </Button>
      )}
    </div>
  );
};

const RegistrationCodePanel = ({ code }: { code: RegistrationCode }) => (
  <div
    className={clsx("flex flex-col gap-2 rounded-lg border border-border p-3")}
  >
    <p className={clsx("text-sm")}>
      In the booth's admin, Settings, Hub, type:
    </p>
    <div className={clsx("flex items-center gap-2")}>
      <code
        className={clsx(
          "font-mono text-2xl font-semibold tracking-widest select-all",
        )}
      >
        {code.code}
      </code>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Copy the code"
        onClick={() =>
          void navigator.clipboard.writeText(code.code).then(
            () => toast.success("Code copied."),
            () => toast.error("Couldn't copy: select the code instead."),
          )
        }
      >
        <Copy />
      </Button>
    </div>
    <p className={clsx("text-xs text-muted-foreground")}>
      It works once, until {format(new Date(code.expiresAt), "EEE HH:mm")}.
    </p>
  </div>
);

const BoothCard = ({
  booth,
  now,
  onChanged,
}: {
  booth: BoothRow;
  now: number;
  onChanged: () => void;
}) => {
  const [code, setCode] = useState<RegistrationCode>();
  const [busy, setBusy] = useState(false);
  const report = reportLine(booth, now);
  const conditions = booth.status?.conditions ?? [];

  const getCode = async () => {
    setBusy(true);
    try {
      setCode(await issueRegistrationCode(booth.id));
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble
            tone={
              report.tone === "ok"
                ? "emerald"
                : report.tone === "warn"
                  ? "amber"
                  : "zinc"
            }
          >
            <Printer />
          </IconBubble>
          {booth.name}
        </CardTitle>
        <CardDescription>{report.text}</CardDescription>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-4")}>
        {booth.status ? (
          <div className={clsx("flex flex-wrap gap-1.5")}>
            {conditions.length === 0 ? (
              <Badge variant="secondary">Printer ready</Badge>
            ) : (
              conditions.map((condition) => (
                <Badge key={condition} variant="secondary">
                  {CONDITION_LABEL[condition]}
                </Badge>
              ))
            )}
            {booth.status.maintenance ? (
              <Badge variant="outline">Maintenance</Badge>
            ) : null}
            {booth.status.dryRun ? (
              <Badge variant="outline">Dry run: never alerts</Badge>
            ) : null}
          </div>
        ) : null}

        <EventWindow booth={booth} onSaved={onChanged} />

        {code ? (
          <RegistrationCodePanel code={code} />
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={clsx("self-start")}
            disabled={busy}
            onClick={() => void getCode()}
          >
            {busy ? (
              <Spinner className="size-4" />
            ) : (
              <KeyRound data-icon="inline-start" />
            )}
            {booth.registeredAt
              ? "New registration code"
              : "Get a registration code"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

const AddBooth = ({ onAdded }: { onAdded: () => void }) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const orgId = await staffOrgId();
      if (!orgId)
        throw new Error("You're not staff of any team on the Hub yet.");
      await addBooth(orgId, name);
      toast.success(
        `${name.trim()} added. Get its registration code to register it.`,
      );
      setName("");
      onAdded();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={clsx("flex items-end gap-2")} onSubmit={submit}>
      <Field className={clsx("flex-1")}>
        <FieldLabel htmlFor="new-booth">Add a booth</FieldLabel>
        <Input
          id="new-booth"
          placeholder="Booth name"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Button type="submit" disabled={busy || name.trim() === ""}>
        <Plus data-icon="inline-start" />
        Add
      </Button>
    </form>
  );
};

/** The org's booths: how each is doing, its event times, its registration. */
export const BoothsScreen = () => {
  const live = useLive("booths", listBooths, ["booth_status"]);
  const now = Date.now();

  if (live.data === undefined) {
    return live.error ? (
      <p className={clsx("text-sm text-destructive")}>
        Couldn't load the booths. Check the connection.
      </p>
    ) : (
      <Spinner className="mx-auto size-5" />
    );
  }

  return (
    <div className={clsx("flex flex-col gap-4")}>
      {live.data.length === 0 ? (
        <p className={clsx("text-sm text-muted-foreground")}>
          No booth yet. Add one, then register it with its code.
        </p>
      ) : (
        live.data.map((booth) => (
          <BoothCard
            key={booth.id}
            booth={booth}
            now={now}
            onChanged={live.reload}
          />
        ))
      )}
      <AddBooth onAdded={live.reload} />
    </div>
  );
};
