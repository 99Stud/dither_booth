import { useEffect, useState } from "react";

/** Studio's screens, as their paths say: a notification links to an alert. */
export type Route =
  | { screen: "alerts"; alertId?: string }
  | { screen: "booths" }
  | { screen: "team" }
  | { screen: "device" };

export function parseRoute(path: string): Route {
  const [, first, second] = path.split("/");
  if (first === "booths") return { screen: "booths" };
  if (first === "team") return { screen: "team" };
  if (first === "device") return { screen: "device" };
  if (first === "alerts" && second)
    return { screen: "alerts", alertId: second };
  return { screen: "alerts" };
}

export const pathOf = (route: Route) =>
  route.screen === "alerts"
    ? route.alertId
      ? `/alerts/${route.alertId}`
      : "/"
    : `/${route.screen}`;

/** The current screen, kept in the address so back and links work. */
export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState(() =>
    parseRoute(window.location.pathname),
  );

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (next: Route) => {
    window.history.pushState(null, "", pathOf(next));
    setRoute(next);
  };
  return [route, go];
}
