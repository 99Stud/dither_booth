// @ts-expect-error: @cheprasov/qrcode does not have typings
import { QRCodeSVG } from "@cheprasov/qrcode";

const qrSVG = new QRCodeSVG("https://www.instagram.com/nexus_station", {
  level: "H",
  image: {
    source: "/public/ressources/NEXUS_STATION_ICON.svg",
    width: "20%",
    height: "20%",
    x: "center",
    y: "center",
  },
});

console.log(qrSVG.toString());
