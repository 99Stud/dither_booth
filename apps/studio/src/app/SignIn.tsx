import type { FormEvent } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@dither-booth/ui/components/ui/field";
import { Input } from "@dither-booth/ui/components/ui/input";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { useState } from "react";
import { toast } from "sonner";

import { hub } from "#lib/hub";

/**
 * Sign in with a code sent by email, typed here. A link would open Safari,
 * not this app, on an iPhone: the two don't share a session.
 */
export const SignIn = () => {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    // Only staff added to the Hub can sign in: no account is created here.
    const { error } = await hub.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.status === 422 || error.code === "otp_disabled"
          ? "This address isn't on the Hub. Ask to be added as staff."
          : `Couldn't send the code: ${error.message}`,
      );
      return;
    }
    setStep("code");
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { error } = await hub.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error)
      toast.error("That code doesn't work. Check it, or ask for a new one.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          {step === "email"
            ? "Use the address you were added to the Hub with."
            : `We sent a code to ${email.trim()}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "email" ? (
          <form className={clsx("flex flex-col gap-3")} onSubmit={sendCode}>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={busy || email.trim() === ""}>
              {busy ? <Spinner className="size-4" /> : "Send code"}
            </Button>
          </form>
        ) : (
          <form className={clsx("flex flex-col gap-3")} onSubmit={verify}>
            <Field>
              <FieldLabel htmlFor="code">Code</FieldLabel>
              <Input
                id="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                required
                className={clsx("font-mono tracking-widest")}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/gu, ""))
                }
              />
              <FieldDescription>It works for an hour, once.</FieldDescription>
            </Field>
            <Button type="submit" disabled={busy || code.length < 6}>
              {busy ? <Spinner className="size-4" /> : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCode("");
                setStep("email");
              }}
            >
              Use another address
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
};
