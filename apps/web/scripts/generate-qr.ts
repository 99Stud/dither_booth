// @ts-expect-error: @cheprasov/qrcode does not have typings
import { QRCodeSVG } from "@cheprasov/qrcode";

const qrSVG = new QRCodeSVG("https://www.instagram.com/99stud", {
  level: "H",
  image: {
    source: "/public/ressources/99stud-logo.svg",
    width: "20%",
    height: "20%",
    x: "center",
    y: "center",
  },
});

console.log(qrSVG.toString());
