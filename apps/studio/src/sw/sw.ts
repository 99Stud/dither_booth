// The service worker: shows each push from the Hub, and opens Studio where a
// tap leads. Built on its own to /sw.js.
import {
  notificationFor,
  parsePush,
  type ShownNotification,
} from "./push-display";

// The DOM's types describe a page, not a worker: only what is used here.
type PushEventLike = Event & {
  data: { text: () => string } | null;
  waitUntil: (work: Promise<unknown>) => void;
};
type NotificationClickLike = Event & {
  notification: { close: () => void; data?: { url?: string } };
  waitUntil: (work: Promise<unknown>) => void;
};
type WindowClientLike = {
  url: string;
  focus: () => Promise<unknown>;
  navigate: (url: string) => Promise<unknown>;
};
type WorkerScope = {
  addEventListener: (type: string, listener: (event: never) => void) => void;
  skipWaiting: () => Promise<void>;
  location: { origin: string };
  registration: {
    showNotification: (title: string, options: object) => Promise<void>;
    getNotifications: (filter: { tag: string }) => Promise<ShownNotification[]>;
  };
  clients: {
    claim: () => Promise<void>;
    matchAll: (options: {
      type: "window";
      includeUncontrolled: boolean;
    }) => Promise<WindowClientLike[]>;
    openWindow: (url: string) => Promise<unknown>;
  };
};

const worker = self as unknown as WorkerScope;

// A new release takes over at once: there is nothing cached to keep in step.
worker.addEventListener("install", () => void worker.skipWaiting());
worker.addEventListener(
  "activate",
  (event: { waitUntil: (work: Promise<unknown>) => void }) =>
    event.waitUntil(worker.clients.claim()),
);

worker.addEventListener("push", (event: PushEventLike) => {
  const incoming = parsePush(event.data?.text());
  event.waitUntil(
    worker.registration
      .getNotifications({ tag: incoming.tag })
      .then((shown) => {
        const { title, options } = notificationFor(incoming, shown);
        return worker.registration.showNotification(title, options);
      }),
  );
});

worker.addEventListener("notificationclick", (event: NotificationClickLike) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url ?? "/",
    worker.location.origin,
  ).href;
  event.waitUntil(
    worker.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const open = windows.find((client) =>
          client.url.startsWith(worker.location.origin),
        );
        if (!open) return worker.clients.openWindow(url);
        await open.focus();
        return open.navigate(url);
      }),
  );
});
