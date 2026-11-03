'use client';

// Face detection + recognition in the browser (face-api on TensorFlow.js).
// Models are served from /public/models (~12 MB, cached for good). Nothing
// here talks to a server: a photo goes in, boxes and 128-number descriptors
// come out.

type FaceApi = typeof import('@vladmandic/face-api');

export interface FoundFace {
  descriptor: number[];
  // Box as fractions of the image so it survives any resizing.
  box: { x: number; y: number; w: number; h: number };
  score: number;
}

let loading: Promise<FaceApi> | null = null;

export function loadFaceApi(onStatus?: (s: string) => void): Promise<FaceApi> {
  if (!loading) {
    loading = (async () => {
      onStatus?.('Loading face models…');
      const faceapi = await import('@vladmandic/face-api');
      // The bundled TF.js is typed loosely by face-api; these calls exist at runtime.
      const tf = faceapi.tf as unknown as { setBackend(n: string): Promise<boolean>; ready(): Promise<void> };
      try {
        await tf.setBackend('webgl');
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      ]);
      return faceapi;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

export async function detectFaces(canvas: HTMLCanvasElement, minConfidence = 0.5): Promise<FoundFace[]> {
  const faceapi = await loadFaceApi();
  const results = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  const W = canvas.width, H = canvas.height;
  return results.map((r) => ({
    descriptor: Array.from(r.descriptor),
    box: {
      x: r.detection.box.x / W,
      y: r.detection.box.y / H,
      w: r.detection.box.width / W,
      h: r.detection.box.height / H,
    },
    score: r.detection.score,
  }));
}
