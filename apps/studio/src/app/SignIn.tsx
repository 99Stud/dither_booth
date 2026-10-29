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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@dither-booth/ui/components/ui/input-otp";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useState } from "react";
import { toast } from "sonner";

import { hub } from "#lib/hub";

/** The Hub's sign-in codes: six digits (otp_length). */
const CODE_LENGTH = 6;

/** Slots sized for a thumb, not a cursor. */
const SLOT = "size-11 text-lg font-medium";

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
          ? "This address isn't on the Hub. Ask a team owner to add you."
          : `Couldn't send the code: ${error.message}`,
      );
      return;
    }
    setStep("code");
  };

  const verify = async (token: string) => {
    setBusy(true);
    const { error } = await hub.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });
    setBusy(false);
    if (error) {
      setCode("");
      toast.error("That code doesn't work. Check it, or ask for a new one.");
    }
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
          <form
            className={clsx("flex flex-col gap-3")}
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (code.length === CODE_LENGTH) void verify(code);
            }}
          >
            <Field>
              <FieldLabel htmlFor="code">Code</FieldLabel>
              <InputOTP
                id="code"
                maxLength={CODE_LENGTH}
                pattern={REGEXP_ONLY_DIGITS}
                autoComplete="one-time-code"
                inputMode="numeric"
                autoFocus
                disabled={busy}
                value={code}
                onChange={setCode}
                // The last digit signs in: no button to look for.
                onComplete={(value: string) => void verify(value)}
              >
                <InputOTPGroup>
                  {[0, 1, 2].map((index) => (
                    <InputOTPSlot key={index} index={index} className={SLOT} />
                  ))}
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  {[3, 4, 5].map((index) => (
                    <InputOTPSlot key={index} index={index} className={SLOT} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <FieldDescription>It works for an hour, once.</FieldDescription>
            </Field>
            <Button type="submit" disabled={busy || code.length < CODE_LENGTH}>
              {busy ? <Spinner className="size-4" /> : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
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
