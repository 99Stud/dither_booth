import type { FC, FormEvent } from "react";

import clsx from "clsx";
import { Lock, RadioTower, Trash2, Wifi } from "lucide-react";
import { useState } from "react";

import { IconBubble } from "#components/misc/IconBubble/index";
import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";

export type WifiCardNetwork = {
  ssid: string;
  signal: number;
  secured: boolean;
  inUse: boolean;
};

export type WifiCardStatus =
  | { available: false }
  | {
      available: true;
      mode: "wifi" | "ethernet" | "hotspot" | "offline";
      ssid: string | null;
      boothWifiChosen: boolean;
      nearby: WifiCardNetwork[];
      saved: string[];
    };

export type WifiCardProps = {
  status: WifiCardStatus | undefined;
  /** Resolves true once the network is saved. */
  onSave: (input: {
    ssid: string;
    password?: string;
    connectNow: boolean;
  }) => Promise<boolean>;
  onForget: (ssid: string) => Promise<void>;
  onSetBoothWifi: (enabled: boolean) => Promise<void>;
  isPending: boolean;
};

export const WIFI_MODE_LABEL = {
  ethernet: "Ethernet",
  hotspot: "Booth Wi-Fi",
  offline: "No network",
  wifi: "Wi-Fi",
} as const;

export const wifiSignalLabel = (signal: number) =>
  signal >= 70 ? "Strong" : signal >= 40 ? "Good" : "Weak";

/**
 * The booth's network, from the Darkroom or admin: what it's on, joining or
 * saving a venue's Wi-Fi (also one that isn't in range yet, the day before),
 * and running the event on the booth's own Wi-Fi.
 */
export const WifiCard: FC<WifiCardProps> = ({
  status,
  onSave,
  onForget,
  onSetBoothWifi,
  isPending,
}) => {
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [secured, setSecured] = useState(true);
  const [joinedSsid, setJoinedSsid] = useState<string | null>(null);

  const ready = status?.available ? status : undefined;
  const onBoothWifi = ready?.mode === "hotspot";
  const passwordTooShort =
    secured && password.length > 0 && password.length < 8;
  const canSubmit =
    ssid.trim().length > 0 && (!secured || password.length >= 8) && !isPending;

  const pick = (network: WifiCardNetwork) => {
    setSsid(network.ssid);
    setSecured(network.secured);
    setPassword("");
    setJoinedSsid(null);
  };

  const submit = async (connectNow: boolean) => {
    const name = ssid.trim();
    const saved = await onSave({
      connectNow,
      password: secured ? password : undefined,
      ssid: name,
    });

    if (!saved) return;
    setPassword("");
    if (connectNow) setJoinedSsid(name);
    else setSsid("");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) void submit(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle
          className={clsx("flex items-center justify-between gap-2.5")}
        >
          <span className={clsx("flex items-center gap-2.5")}>
            <IconBubble tone="sky">
              <Wifi />
            </IconBubble>
            <h2>Wi-Fi</h2>
          </span>
          {ready && (
            <Badge variant="secondary" className={clsx("max-w-[60%] truncate")}>
              {ready.mode === "wifi" && ready.ssid
                ? ready.ssid
                : WIFI_MODE_LABEL[ready.mode]}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          The booth joins saved networks on its own. With none around, it opens
          its own Wi-Fi and prints a ticket to join it.
        </CardDescription>
      </CardHeader>

      <CardContent className={clsx("flex flex-col gap-5")}>
        {status && !status.available && (
          <p className={clsx("text-sm text-muted-foreground")}>
            This machine manages its own Wi-Fi: there is nothing to set here.
          </p>
        )}

        {joinedSsid && (
          <p role="status" className={clsx("rounded-lg bg-muted p-3 text-sm")}>
            Joining {joinedSsid}. If this device was on the booth Wi-Fi, join{" "}
            {joinedSsid} on it too: the booth prints a new ticket once it's on.
          </p>
        )}

        {ready && (
          <>
            <section className={clsx("flex flex-col gap-2")}>
              <h3 className={clsx("text-sm font-medium")}>Nearby</h3>
              {ready.nearby.length === 0 ? (
                <p className={clsx("text-sm text-muted-foreground")}>
                  No networks seen. Type the name below.
                </p>
              ) : (
                <ul className={clsx("flex flex-col gap-1")}>
                  {ready.nearby.map((network) => (
                    <li key={network.ssid}>
                      <button
                        type="button"
                        onClick={() => pick(network)}
                        aria-pressed={ssid === network.ssid}
                        className={clsx(
                          "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm",
                          "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          ssid === network.ssid && "bg-muted",
                        )}
                      >
                        <span
                          className={clsx("flex min-w-0 items-center gap-2")}
                        >
                          {network.secured && (
                            <Lock
                              aria-label="Password protected"
                              className={clsx("size-3.5 shrink-0")}
                            />
                          )}
                          <span className={clsx("truncate")}>
                            {network.ssid}
                          </span>
                          {network.inUse && (
                            <span className={clsx("text-muted-foreground")}>
                              · connected
                            </span>
                          )}
                        </span>
                        <span
                          className={clsx("shrink-0 text-muted-foreground")}
                        >
                          {wifiSignalLabel(network.signal)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <form className={clsx("flex flex-col gap-3")} onSubmit={onSubmit}>
              <Field>
                <FieldLabel htmlFor="wifi-ssid">Network name</FieldLabel>
                <Input
                  id="wifi-ssid"
                  value={ssid}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => {
                    setSsid(event.target.value);
                    setJoinedSsid(null);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="wifi-password">Password</FieldLabel>
                <Input
                  id="wifi-password"
                  type="password"
                  value={password}
                  disabled={!secured}
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-invalid={passwordTooShort || undefined}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <FieldDescription>
                  {passwordTooShort
                    ? "Wi-Fi passwords are at least 8 characters."
                    : secured
                      ? "As written on the venue's sign or router."
                      : "Open network: no password."}{" "}
                  <button
                    type="button"
                    className={clsx("underline underline-offset-2")}
                    onClick={() => setSecured(!secured)}
                  >
                    {secured ? "No password?" : "It has a password"}
                  </button>
                </FieldDescription>
              </Field>
              <div className={clsx("flex flex-wrap gap-2")}>
                <Button type="submit" disabled={!canSubmit}>
                  Join now
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canSubmit}
                  onClick={() => void submit(false)}
                >
                  Save for later
                </Button>
              </div>
              {onBoothWifi && (
                <p className={clsx("text-sm text-muted-foreground")}>
                  Joining leaves the booth Wi-Fi, so this device loses the booth
                  for a moment.
                </p>
              )}
            </form>

            {ready.saved.length > 0 && (
              <section className={clsx("flex flex-col gap-2")}>
                <h3 className={clsx("text-sm font-medium")}>Saved</h3>
                <ul className={clsx("flex flex-col gap-1")}>
                  {ready.saved.map((name) => (
                    <li
                      key={name}
                      className={clsx(
                        "flex min-h-11 items-center justify-between gap-3 px-3 text-sm",
                      )}
                    >
                      <span className={clsx("truncate")}>{name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        aria-label={`Forget ${name}`}
                        onClick={() => void onForget(name)}
                      >
                        <Trash2 />
                        Forget
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section
              className={clsx(
                "flex flex-col gap-2 rounded-lg border border-border p-3",
              )}
            >
              <h3
                className={clsx("flex items-center gap-2 text-sm font-medium")}
              >
                <RadioTower className={clsx("size-4")} />
                Booth Wi-Fi
              </h3>
              <p className={clsx("text-sm text-muted-foreground")}>
                {ready.boothWifiChosen
                  ? "The event runs on the booth's own Wi-Fi, whatever else is around."
                  : "For venue Wi-Fi that keeps devices apart, or no Wi-Fi at all: the iPad joins the booth directly. Photos still print; cloud sync waits for a network."}
              </p>
              <Button
                variant="outline"
                className={clsx("self-start")}
                disabled={isPending}
                onClick={() => void onSetBoothWifi(!ready.boothWifiChosen)}
              >
                {ready.boothWifiChosen
                  ? "Go back to saved networks"
                  : "Run on booth Wi-Fi"}
              </Button>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
};
