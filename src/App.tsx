import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { Scanner } from "@yudiel/react-qr-scanner";

const MAX_BYTES_PER_QR_CODE = 1024;
const QR_VALUE_INTERVAL_MS = 80;
const MAX_MISSING_PARTS_DISPLAY = 8;
const RECEIVED_PARTS_BATCH_MS = 120;

type QRData = {
  index: number;
  total: number;
  value: string;
  bytes: number[];
  name: string;
  type: string;
  encoding: "gzip" | "raw";
};

const parseQrValueString = (qrString: string): QRData => {
  const endOfMetaIndex = qrString.indexOf("]");
  if (endOfMetaIndex < 0) throw new Error("Invalid QR code");

  const metaStr = qrString.substring(0, endOfMetaIndex + 1);
  const value = qrString.substring(endOfMetaIndex + 1, qrString.length);

  const [indexValue, totalValue, nameEncoded, typeEncoded, encoding] = metaStr
    .replace("[", "")
    .replace("]", "")
    .split("/");
  const index = parseInt(indexValue);
  const total = parseInt(totalValue);

  if (
    !Number.isInteger(index) ||
    !Number.isInteger(total) ||
    index < 0 ||
    index >= total
  ) {
    throw new Error("Invalid QR code");
  }

  const bytes: number[] = [];
  for (const char of value) {
    bytes.push(char.charCodeAt(0));
  }

  return {
    index,
    total,
    bytes,
    value,
    name: decodeURIComponent(nameEncoded || ""),
    type: decodeURIComponent(typeEncoded || ""),
    encoding: encoding === "gzip" ? "gzip" : "raw",
  };
};

const App = () => {
  const [mode, setMode] = useState<"share" | "receive">("share");
  const [file, setFile] = useState<File | null>(null);
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [receivedQrData, setReceivedQrData] = useState<Record<number, QRData>>(
    {},
  );
  const receivedRawValuesRef = useRef(new Set<string>());
  const pendingPartsRef = useRef<Record<number, QRData>>({});
  const batchTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!file) return;

    let interval = 0;
    let active = true;

    file.bytes().then(async (fileBytes) => {
      const compressedBytes = new Uint8Array(
        await new Response(
          file.stream().pipeThrough(new CompressionStream("gzip")),
        ).arrayBuffer(),
      );
      if (!active) return;

      const encoding =
        compressedBytes.length < fileBytes.length ? "gzip" : "raw";
      const bytesArr = encoding === "gzip" ? compressedBytes : fileBytes;
      const values: string[] = [];
      let value = "";

      bytesArr.forEach((byte) => {
        value += String.fromCharCode(byte);
        if (value.length === MAX_BYTES_PER_QR_CODE) {
          values.push(value);
          value = "";
        }
      });

      if (value || !values.length) values.push(value);

      const qrValues = values.map((qrValue, index) => {
        const fileMeta =
          index === 0
            ? `/${encodeURIComponent(file.name)}/${encodeURIComponent(file.type)}/${encoding}`
            : "";
        return `[${index}/${values.length}${fileMeta}]${qrValue}`;
      });

      let qrValueIndex = 0;
      setQrData(parseQrValueString(qrValues[qrValueIndex]));

      interval = setInterval(() => {
        qrValueIndex++;
        if (qrValueIndex >= qrValues.length) qrValueIndex = 0;
        setQrData(parseQrValueString(qrValues[qrValueIndex]));
      }, QR_VALUE_INTERVAL_MS);
    });

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [file]);

  useEffect(() => {
    return () => {
      if (batchTimeoutRef.current !== null) {
        clearTimeout(batchTimeoutRef.current);
      }
    };
  }, []);

  const clearReceivedData = () => {
    if (batchTimeoutRef.current !== null) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
    receivedRawValuesRef.current.clear();
    pendingPartsRef.current = {};
    setReceivedQrData({});
  };

  const receivedParts = Object.values(receivedQrData);
  const receivedTotal = receivedParts[0]?.total || 0;
  const isReady = receivedTotal > 0 && receivedParts.length === receivedTotal;
  const receivedFile = receivedQrData[0];
  const progress = receivedTotal
    ? Math.round((receivedParts.length / receivedTotal) * 100)
    : 0;
  const missingParts = receivedTotal
    ? Array.from({ length: receivedTotal }, (_, index) => index)
        .filter((index) => !receivedQrData[index])
        .slice(0, MAX_MISSING_PARTS_DISPLAY)
    : [];
  const hasMoreMissing =
    receivedTotal - receivedParts.length > MAX_MISSING_PARTS_DISPLAY;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-8">
      <div className="flex flex-col gap-5 max-w-lg mx-auto">
        <header className="flex flex-col gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Screen to screen
          </div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-br from-white via-zinc-200 to-zinc-600 bg-clip-text text-transparent sm:text-5xl">
            thrash
          </h1>
          <p className="text-sm text-zinc-400">
            Send a file through your screen.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-900 p-1">
          <button
            className={`rounded-lg px-3 py-2 cursor-pointer transition-colors ${
              mode === "share"
                ? "bg-zinc-100 text-zinc-950"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
            onClick={() => setMode("share")}
          >
            Share
          </button>
          <button
            className={`rounded-lg px-3 py-2 cursor-pointer transition-colors ${
              mode === "receive"
                ? "bg-zinc-100 text-zinc-950"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
            onClick={() => setMode("receive")}
          >
            Receive
          </button>
        </div>

        <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6 shadow-xl">
          {mode === "share" && (
            <>
              {!file && (
                <label className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-zinc-700 px-4 py-10 cursor-pointer hover:border-zinc-500 transition-colors">
                  <span className="font-medium">Choose a file</span>
                  <span className="text-xs text-zinc-500">
                    Small files work best
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] || null);
                      setQrData(null);
                    }}
                  />
                </label>
              )}

              {file && (
                <div className="flex items-center justify-between gap-4 rounded-xl bg-zinc-950 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{file.name}</div>
                    <div className="text-xs text-zinc-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <button
                    className="text-zinc-400 hover:text-zinc-100 cursor-pointer"
                    onClick={() => {
                      setFile(null);
                      setQrData(null);
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}

              {qrData && (
                <>
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Keep this screen steady</span>
                    <span>
                      Part {qrData.index + 1} of {qrData.total}
                      {qrData.encoding === "gzip" ? " - compressed" : ""}
                    </span>
                  </div>
                  <div className="rounded-xl bg-white p-4">
                    <QRCode
                      value={`[${qrData.index}/${qrData.total}${
                        qrData.index === 0
                          ? `/${encodeURIComponent(qrData.name)}/${encodeURIComponent(qrData.type)}/${qrData.encoding}`
                          : ""
                      }]${qrData.value}`}
                      className="w-full h-auto"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {mode === "receive" && (
            <>
              {!isReady && (
                <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
                  <Scanner
                    formats={["qr_code"]}
                    retryDelay={0}
                    sound={false}
                    settleDelayMs={100}
                    constraints={{
                      facingMode: "environment",
                      width: { min: 640, ideal: 720, max: 1280 },
                      height: { min: 640, ideal: 720, max: 1280 },
                    }}
                    onScan={(codes) => {
                      for (const code of codes) {
                        if (receivedRawValuesRef.current.has(code.rawValue))
                          continue;

                        try {
                          const data = parseQrValueString(code.rawValue);
                          receivedRawValuesRef.current.add(code.rawValue);
                          pendingPartsRef.current[data.index] = data;
                        } catch {
                          // Ignore QR codes that are not file parts.
                        }
                      }

                      if (
                        Object.keys(pendingPartsRef.current).length > 0 &&
                        batchTimeoutRef.current === null
                      ) {
                        batchTimeoutRef.current = window.setTimeout(() => {
                          const parts = pendingPartsRef.current;
                          pendingPartsRef.current = {};
                          batchTimeoutRef.current = null;
                          setReceivedQrData((current) => ({
                            ...current,
                            ...parts,
                          }));
                        }, RECEIVED_PARTS_BATCH_MS);
                      }
                    }}
                  />
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>{isReady ? "File ready" : "Scanning for parts"}</span>
                <span>
                  {receivedParts.length}/{receivedTotal || "?"}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-zinc-100 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {receivedParts.length > 0 && !isReady && (
                <div className="text-xs text-zinc-500">
                  Missing [{missingParts.map((part) => part + 1).join(", ")}
                  {hasMoreMissing ? ", ..." : ""}]
                </div>
              )}

              {isReady && (
                <button
                  className="rounded-lg bg-zinc-100 px-4 py-2.5 font-medium text-zinc-950 cursor-pointer hover:bg-white"
                  onClick={async () => {
                    let bytes = new Uint8Array(
                      receivedParts
                        .sort((a, b) => a.index - b.index)
                        .flatMap((part) => part.bytes),
                    );
                    if (receivedFile.encoding === "gzip") {
                      bytes = new Uint8Array(
                        await new Response(
                          new Blob([bytes])
                            .stream()
                            .pipeThrough(new DecompressionStream("gzip")),
                        ).arrayBuffer(),
                      );
                    }
                    const url = URL.createObjectURL(
                      new Blob([bytes], {
                        type: receivedFile.type,
                      }),
                    );
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = receivedFile.name || "received-file";
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download {receivedFile.name || "file"}
                </button>
              )}

              {receivedParts.length > 0 && (
                <button
                  className="self-center text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  onClick={clearReceivedData}
                >
                  Clear received parts
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
};

export default App;
