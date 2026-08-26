# thrash

Send a file through your screen.

thrash is a screen-to-screen file transfer app that encodes a file into a sequence of QR codes and reconstructs it by scanning those codes with another device's camera. No network, no cables — just two screens pointed at each other.

## How it works

**Share mode**

1. Pick a file. The app splits it into chunks of up to 1024 bytes per QR code.
2. The file is gzip-compressed first; if compression makes it smaller, the compressed payload is used.
3. Each chunk is embedded in a QR code carrying a small metadata header (`[index/total/name/type/encoding]`).
4. The codes cycle on screen (every 80 ms) — keep the screen steady while the receiver scans.

**Receive mode**

1. The camera scans QR codes as they appear on the sender's screen.
2. Scanned parts are deduplicated, batched, and reassembled by index.
3. When all parts are received, the file is reassembled (decompressed if needed) and downloaded with its original name and type.

Files transfer best when they're small; each QR code holds at most ~1 KB, so a 1 MB file needs roughly a thousand scans.

## Tech stack

- React 19 + TypeScript
- Vite
- Tailwind CSS 4
- [react-qr-code](https://github.com/rosskhanas/react-qr-code) — QR rendering
- [@yudiel/react-qr-scanner](https://github.com/yudielcurbelo/react-qr-scanner) — camera scanning
- [CompressionStream](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream) / `DecompressionStream` — gzip compression (no libraries required)
- Oxlint for linting

## Getting started

```bash
npm install
npm run dev
```

Then open the URL printed by Vite. Run the app on two devices: one to share, one to receive.

## Scripts

| Script        | Description                          |
| ------------- | ------------------------------------ |
| `npm run dev` | Start the Vite dev server            |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build     |
| `npm run lint` | Run Oxlint                           |

## Deployment

The app is a static site — build it and serve the `dist/` directory from any static host:

```bash
npm run build
```

Because the transfer happens purely through the screen, the two devices never need to be on the same network. If you serve it from a tunneled URL (e.g. ngrok), the dev server already allows `*.ngrok-free.app` and `*.ngrok.app` hosts.
