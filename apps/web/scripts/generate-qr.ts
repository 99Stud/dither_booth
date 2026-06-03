// @ts-expect-error: @cheprasov/qrcode does not have typings
import { QRCodeSVG } from "@cheprasov/qrcode";

const qrSVG = new QRCodeSVG(
  "https://analytics.ditherbooth.com/track/nexus-2026/heirvey-instagram",
  {
    level: "H",
    image: {
      source: "/public/ressources/instagram.svg",
      width: "20%",
      height: "20%",
      x: "center",
      y: "center",
    },
  },
);

console.log(qrSVG.toString());
