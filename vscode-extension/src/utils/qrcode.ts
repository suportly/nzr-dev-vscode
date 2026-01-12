import * as QRCode from 'qrcode';
import { QRCodePayload } from './auth';

/**
 * QR code generation options
 */
export interface QRCodeOptions {
  /** Size in pixels */
  width?: number;
  /** Error correction level */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Margin (quiet zone) */
  margin?: number;
  /** Dark color */
  darkColor?: string;
  /** Light color */
  lightColor?: string;
}

const defaultOptions: QRCodeOptions = {
  width: 256,
  errorCorrectionLevel: 'M',
  margin: 2,
  darkColor: '#000000',
  lightColor: '#FFFFFF',
};

/**
 * Generate QR code as data URL (base64 image)
 */
export async function generateQRCodeDataUrl(
  payload: QRCodePayload,
  options: QRCodeOptions = {}
): Promise<string> {
  const mergedOptions = { ...defaultOptions, ...options };
  const data = JSON.stringify(payload);

  try {
    const dataUrl = await QRCode.toDataURL(data, {
      width: mergedOptions.width,
      errorCorrectionLevel: mergedOptions.errorCorrectionLevel,
      margin: mergedOptions.margin,
      color: {
        dark: mergedOptions.darkColor,
        light: mergedOptions.lightColor,
      },
    });
    return dataUrl;
  } catch (error) {
    throw new Error(`Failed to generate QR code: ${error}`);
  }
}

/**
 * Generate QR code as SVG string
 */
export async function generateQRCodeSvg(
  payload: QRCodePayload,
  options: QRCodeOptions = {}
): Promise<string> {
  const mergedOptions = { ...defaultOptions, ...options };
  const data = JSON.stringify(payload);

  try {
    const svg = await QRCode.toString(data, {
      type: 'svg',
      width: mergedOptions.width,
      errorCorrectionLevel: mergedOptions.errorCorrectionLevel,
      margin: mergedOptions.margin,
      color: {
        dark: mergedOptions.darkColor,
        light: mergedOptions.lightColor,
      },
    });
    return svg;
  } catch (error) {
    throw new Error(`Failed to generate QR code SVG: ${error}`);
  }
}

/**
 * Generate QR code as terminal string (for debugging)
 */
export async function generateQRCodeTerminal(
  payload: QRCodePayload
): Promise<string> {
  const data = JSON.stringify(payload);

  try {
    const terminal = await QRCode.toString(data, {
      type: 'terminal',
      errorCorrectionLevel: 'L',
    });
    return terminal;
  } catch (error) {
    throw new Error(`Failed to generate terminal QR code: ${error}`);
  }
}

/**
 * Create HTML for QR code display with styling
 */
export function createQRCodeHtml(
  dataUrl: string,
  pin: string,
  workspaceName: string,
  expiresAt: Date
): string {
  const expiresIn = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const minutes = Math.floor(expiresIn / 60);
  const seconds = expiresIn % 60;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NZR Dev - Pairing</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #1E1E1E;
      color: #CCCCCC;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .container {
      text-align: center;
      max-width: 400px;
    }
    h1 {
      color: #007ACC;
      margin-bottom: 8px;
    }
    .workspace-name {
      color: #8B8B8B;
      margin-bottom: 24px;
    }
    .qr-container {
      background: white;
      padding: 16px;
      border-radius: 12px;
      display: inline-block;
      margin-bottom: 24px;
    }
    .qr-code {
      display: block;
    }
    .pin-section {
      background: #2D2D2D;
      padding: 16px 24px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .pin-label {
      font-size: 14px;
      color: #8B8B8B;
      margin-bottom: 8px;
    }
    .pin-code {
      font-size: 32px;
      font-weight: bold;
      letter-spacing: 8px;
      color: #3794FF;
    }
    .expiry {
      font-size: 14px;
      color: #8B8B8B;
    }
    .expiry-time {
      color: #F48771;
    }
    .instructions {
      font-size: 14px;
      color: #8B8B8B;
      line-height: 1.6;
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Connect to VSCode</h1>
    <p class="workspace-name">${escapeHtml(workspaceName)}</p>

    <div class="qr-container">
      <img src="${dataUrl}" alt="Pairing QR Code" class="qr-code" width="256" height="256">
    </div>

    <div class="pin-section">
      <div class="pin-label">Or enter this PIN:</div>
      <div class="pin-code">${pin}</div>
    </div>

    <p class="expiry">
      Expires in <span class="expiry-time" id="timer">${minutes}:${seconds.toString().padStart(2, '0')}</span>
    </p>

    <p class="instructions">
      Open the NZR Dev app on your mobile device<br>
      and scan this QR code or enter the PIN.
    </p>
  </div>

  <script>
    const expiresAt = ${expiresAt.getTime()};
    const timerEl = document.getElementById('timer');

    function updateTimer() {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      timerEl.textContent = mins + ':' + secs.toString().padStart(2, '0');

      if (remaining <= 0) {
        timerEl.textContent = 'Expired';
        timerEl.style.color = '#F14C4C';
      }
    }

    setInterval(updateTimer, 1000);
  </script>
</body>
</html>
  `.trim();
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, char => escapeMap[char]);
}
