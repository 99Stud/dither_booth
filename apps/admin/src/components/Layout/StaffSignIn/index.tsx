import type { FC, FormEvent } from "react";

import { darkroomPinSchema } from "@dither-booth/shared/darkroom";
import { DitherBoothMark } from "@dither-booth/ui/components/svg/DitherBoothMark/index";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Input } from "@dither-booth/ui/components/ui/input";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { LockKeyhole } from "lucide-react";
import { useState } from "react";

import { DOCS_PATH } from "#lib/docs/docs.constants";
import { signInWithStaffPin } from "#lib/staff-session/staff-session.client";

/**
 * In front of all of admin: the booth's tickets lead to it and can end up
 * with a guest. With no PIN set yet, says how to set one on the booth.
 */
export const StaffSignIn: FC<{ pinSet: boolean }> = ({ pinSet }) => {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const isPinValid = darkroomPinSchema.safeParse(pin).success;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isPinValid || isPending) return;

    setIsPending(true);
    setErrorMessage(null);
    const refusal = await signInWithStaffPin(pin);
    setPin("");

    if (refusal) {
      setErrorMessage(refusal);
      setIsPending(false);
      return;
    }

    // Everything read while signed out was refused: read it again.
    await queryClient.invalidateQueries();
    setIsPending(false);
  };

  return (
    <main
      className={clsx(
        "flex min-h-dvh w-full items-center justify-center bg-background p-4",
      )}
    >
      <Card className={clsx("w-full max-w-sm")}>
        <CardHeader className={clsx("items-center gap-3 text-center")}>
          <span
            className={clsx(
              "mx-auto flex size-12 items-center justify-center",
              "rounded-2xl bg-primary text-primary-foreground",
            )}
          >
            <DitherBoothMark className="h-6" />
          </span>
          <CardTitle>
            <h1>Booth admin</h1>
          </CardTitle>
          <CardDescription>
            {pinSet
              ? "Enter the staff PIN."
              : "No staff PIN is set yet. On the booth, run booth pin, then reload this page."}
          </CardDescription>
        </CardHeader>
        <CardContent className={clsx("flex flex-col gap-3")}>
          {pinSet ? (
            <form className={clsx("flex flex-col gap-3")} onSubmit={submit}>
              <Input
                aria-label="Staff PIN"
                autoComplete="off"
                autoFocus
                enterKeyHint="go"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                placeholder="4 to 8 digits"
                type="password"
                value={pin}
                onChange={(event) => {
                  setErrorMessage(null);
                  setPin(event.target.value.replace(/\D/g, ""));
                }}
              />
              <p
                className={clsx("min-h-5 text-sm font-medium text-destructive")}
                role={errorMessage ? "alert" : undefined}
              >
                {errorMessage}
              </p>
              <Button type="submit" disabled={!isPinValid || isPending}>
                {isPending ? (
                  <Spinner className="size-4" />
                ) : (
                  <>
                    <LockKeyhole data-icon="inline-start" />
                    Unlock
                  </>
                )}
              </Button>
            </form>
          ) : null}
          <a
            className={clsx(
              "text-center text-sm text-muted-foreground underline-offset-4",
              "hover:underline",
            )}
            href={`${DOCS_PATH}maintenance/recovery/`}
            rel="noopener"
            target="_blank"
          >
            Forgot the PIN?
          </a>
        </CardContent>
      </Card>
    </main>
  );
};
