import type { Session } from "@supabase/supabase-js";

import { NinetyNineStudLogo } from "@dither-booth/ui/components/svg/99StudLogo/index";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AlertBanner } from "#app/AlertBanner";
import { AlertsScreen } from "#app/AlertsScreen";
import { BoothsScreen } from "#app/BoothsScreen";
import { DeviceCard } from "#app/DeviceCard";
import { SignIn } from "#app/SignIn";
import { Splash } from "#app/Splash";
import { TabBar } from "#app/TabBar";
import { listAlerts } from "#lib/alerts";
import { hub } from "#lib/hub";
import { useLive } from "#lib/live";
import { type Route, useRoute } from "#lib/route";

const TITLES: Record<Route["screen"], string> = {
  alerts: "Alerts",
  booths: "Booths",
  device: "This device",
};

/** The signed-in app: a screen, and the tab bar under it. */
const SignedIn = ({ userId, email }: { userId: string; email: string }) => {
  const [route, go] = useRoute();
  // One read for the Alerts screen, the banner and the tab's count.
  const alerts = useLive("alerts", () => listAlerts(), ["alert"]);
  const openAlerts = (alerts.data ?? []).filter(
    (alert) => alert.resolvedAt === null,
  ).length;

  return (
    <>
      {route.screen !== "alerts" ? (
        <AlertBanner
          alerts={alerts.data ?? []}
          onOpen={(alertId) => go({ screen: "alerts", alertId })}
        />
      ) : null}
      <h2 className={clsx("text-xl font-semibold")}>{TITLES[route.screen]}</h2>
      {route.screen === "alerts" ? (
        <AlertsScreen live={alerts} focusId={route.alertId} />
      ) : null}
      {route.screen === "booths" ? <BoothsScreen /> : null}
      {route.screen === "device" ? (
        <DeviceCard userId={userId} email={email} />
      ) : null}
      <TabBar route={route} onGo={go} openAlerts={openAlerts} />
    </>
  );
};

/** Studio: sign in, then the booths' alerts, the booths, and this device. */
export const App = () => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [showSplash, setShowSplash] = useState(true);
  const hideSplash = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    void hub.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = hub.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <>
      {/* Covered by the splash: out of reach until it leaves. */}
      <div
        inert={showSplash}
        className={clsx(
          "mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6",
          "px-[max(1rem,env(safe-area-inset-left))] pt-[max(1.5rem,env(safe-area-inset-top))]",
          // Room for the tab bar at the bottom.
          "pb-[calc(5rem+env(safe-area-inset-bottom))]",
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
            <SignedIn
              userId={session.user.id}
              email={session.user.email ?? ""}
            />
          ) : (
            <SignIn />
          )}
        </main>

        {/* Signed out, the first screen staff see: who makes it. */}
        {session === null && (
          <footer
            className={clsx(
              "mt-auto flex items-center justify-center gap-2",
              "text-xs text-muted-foreground",
            )}
          >
            <NinetyNineStudLogo className="h-5" />
            Powered by 99Stud
          </footer>
        )}
      </div>

      {showSplash ? (
        <Splash ready={session !== undefined} onDone={hideSplash} />
      ) : null}
    </>
  );
};
