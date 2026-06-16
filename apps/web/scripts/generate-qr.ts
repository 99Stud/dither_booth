// @ts-expect-error: @cheprasov/qrcode does not have typings
import { QRCodeSVG } from "@cheprasov/qrcode";

const qrSVG = new QRCodeSVG(
  "https://go.ditherbooth.com/track/framer-event/framer",
  {
    level: "H",
    image: {
      source: "/public/ressources/framer-logo.svg",
      width: "20%",
      height: "20%",
      x: "center",
      y: "center",
    },
  },
);

console.log(qrSVG.toString());
