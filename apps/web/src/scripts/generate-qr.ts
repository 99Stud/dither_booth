import { QRCodeSVG } from "@cheprasov/qrcode";

const qrSVG = new QRCodeSVG("https://www.instagram.com/99stud");
const dataUrlWithSVGQRCode = qrSVG.toDataUrl();
const xmlWithQRCode = qrSVG.toString();

console.log(xmlWithQRCode);
