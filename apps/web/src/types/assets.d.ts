declare module "*.css";

declare module "@cheprasov/qrcode" {
  export class QRCodeSVG {
    constructor(content: string, options?: unknown);
    toString(): string;
  }
}
