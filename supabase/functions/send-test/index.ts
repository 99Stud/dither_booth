import { createServiceClient } from "../_shared/clients.ts";
import { createDeviceStore } from "../_shared/devices.ts";
import { createWebPushSender } from "../_shared/web-push.ts";
import { handleSendTest } from "./handler.ts";

const admin = createServiceClient();
const sender = createWebPushSender((name) => Deno.env.get(name));
const devices = createDeviceStore(admin);

Deno.serve((req) =>
  handleSendTest(req, {
    ready: sender.ready,
    send: sender.send,
    forget: devices.forget,
    markDelivered: devices.markDelivered,
    listDevices: (userId) => devices.list({ userId }),
    // Asks Auth, so a signed-out or removed user is refused now.
    async authenticate(token) {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
  }),
);
