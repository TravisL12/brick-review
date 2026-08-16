import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

const MAX_EDGE = 1024;

export interface CameraCaptureProps {
  /** The parent assigns a capture function here to grab the current frame. */
  captureRef: MutableRefObject<(() => Promise<Blob | null>) | null>;
  /** Drawn over the video when the last result had a bounding box. */
  overlay?: { left: number; upper: number; right: number; lower: number; width: number; height: number } | null;
}

export function CameraCapture({ captureRef, overlay }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  const start = useCallback(
    async (preferredDeviceId?: string) => {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser does not expose a camera API. Use the file upload instead.');
        return;
      }
      stop();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: preferredDeviceId
            ? { deviceId: { exact: preferredDeviceId }, width: { ideal: 1280 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setActive(true);

        // Labels only populate after permission is granted.
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === 'videoinput'));
        const settings = stream.getVideoTracks()[0]?.getSettings();
        if (settings?.deviceId) setDeviceId(settings.deviceId);
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError') {
          setError('Camera permission denied. Allow it in the browser and try again.');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setError('No usable camera found. Try a different device or upload a photo.');
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
        setActive(false);
      }
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  useEffect(() => {
    captureRef.current = async () => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return null;

      const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      return new Promise<Blob | null>((resolve) =>
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85),
      );
    };
    return () => {
      captureRef.current = null;
    };
  }, [captureRef]);

  const box = overlay
    ? {
        left: `${(overlay.left / overlay.width) * 100}%`,
        top: `${(overlay.upper / overlay.height) * 100}%`,
        width: `${((overlay.right - overlay.left) / overlay.width) * 100}%`,
        height: `${((overlay.lower - overlay.upper) / overlay.height) * 100}%`,
      }
    : null;

  return (
    <div className="camera">
      <div className="camera-stage">
        <video ref={videoRef} playsInline muted className={active ? '' : 'idle'} />
        {!active && <div className="camera-idle">Camera off</div>}
        {active && box && <div className="camera-box" style={box} />}
      </div>

      <div className="row">
        {active ? (
          <button onClick={stop}>Stop camera</button>
        ) : (
          <button className="primary" onClick={() => void start(deviceId || undefined)}>
            Start camera
          </button>
        )}
        {devices.length > 1 && (
          <select
            value={deviceId}
            onChange={(e) => {
              setDeviceId(e.target.value);
              if (active) void start(e.target.value);
            }}
          >
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
