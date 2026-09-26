import QRCode from "qrcode";

export interface QrCodeOptions {
  margin?: number;
  width?: number;
  darkColor?: string;
  lightColor?: string;
}

/**
 * Generates an SVG string representation of a QR code completely client-side (offline).
 */
export async function generateQrSvg(
  text: string,
  options: QrCodeOptions = {}
): Promise<string> {
  const {
    margin = 1,
    darkColor = "#000000",
    lightColor = "#ffffff",
  } = options;

  try {
    const svgString = await QRCode.toString(text, {
      type: "svg",
      margin,
      errorCorrectionLevel: "M",
      color: {
        dark: darkColor,
        light: lightColor,
      },
    });
    return svgString;
  } catch (err) {
    console.error("Failed to generate QR SVG:", err);
    throw err;
  }
}

/**
 * Generates a base64 Data URL representation of a QR code completely client-side (offline).
 */
export async function generateQrDataUrl(
  text: string,
  options: QrCodeOptions = {}
): Promise<string> {
  const {
    margin = 1,
    width = 280,
    darkColor = "#000000",
    lightColor = "#ffffff",
  } = options;

  try {
    const dataUrl = await QRCode.toDataURL(text, {
      margin,
      width,
      errorCorrectionLevel: "M",
      color: {
        dark: darkColor,
        light: lightColor,
      },
    });
    return dataUrl;
  } catch (err) {
    console.error("Failed to generate QR Data URL:", err);
    throw err;
  }
}
