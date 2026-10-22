import type { Session } from "@supabase/supabase-js";

import { Button } from "@dither-booth/ui/components/ui/button";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";

import { DeviceCard } from "#app/DeviceCard";
import { SignIn } from "#app/SignIn";
import { hub } from "#lib/hub";

/** Studio: sign in, then set this device up to get the booths' alerts. */
export const App = () => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void hub.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = hub.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div
      className={clsx(
        "mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6",
        "px-[max(1rem,env(safe-area-inset-left))] pt-[max(1.5rem,env(safe-area-inset-top))]",
        "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
      )}
    >
      <header className={clsx("flex items-center justify-between gap-3")}>
        <div className={clsx("flex items-center gap-3")}>
          <img
            src="/icons/icon-180.png"
            alt=""
            className={clsx("size-9 rounded-[22%]")}
          />
          <div>
            <h1 className={clsx("text-base leading-tight font-semibold")}>
              Studio
            </h1>
            <p className={clsx("text-sm text-muted-foreground")}>
              Dither Booth alerts
            </p>
          </div>
        </div>
        {session ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void hub.auth.signOut()}
          >
            <LogOut data-icon="inline-start" />
            Sign out
          </Button>
        ) : null}
      </header>

      <main className={clsx("flex flex-col gap-4")}>
        {session === undefined ? (
          <Spinner className="mx-auto size-5" />
        ) : session ? (
          <DeviceCard
            userId={session.user.id}
            email={session.user.email ?? ""}
          />
        ) : (
          <SignIn />
        )}
      </main>
    </div>
  );
};
