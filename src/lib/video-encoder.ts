import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export interface EncoderSettings {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export interface EncodeResult {
  blob: Blob;
  width: number;
  height: number;
}

export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined" && typeof AudioEncoder !== "undefined";
}

export async function encodeVideo(
  canvas: OffscreenCanvas,
  totalFrames: number,
  renderFrameFn: (frameIndex: number, width: number, height: number) => void,
  settings: EncoderSettings,
  onProgress?: (progress: number) => void,
  audioFile?: File
): Promise<EncodeResult> {

  const resolutions = [
    { width: 1920, height: 1080, bitrate: 8_000_000 },
    { width: 1280, height: 720, bitrate: 4_000_000 }
  ];

  let lastError: Error | null = null;

  for (const res of resolutions) {
    try {
      console.log(`Trying resolution: ${res.width}x${res.height}`);

      const blob = await encodeVideoAtResolution(
        canvas,
        totalFrames,
        renderFrameFn,
        { ...settings, ...res },
        onProgress,
        audioFile
      );

      return { blob, width: res.width, height: res.height };

    } catch (error) {

      console.warn(`Resolution ${res.width}x${res.height} failed:`, error);
      lastError = error as Error;

    }
  }

  throw new Error(`All resolutions failed. Last error: ${lastError?.message}`);
}

async function encodeVideoAtResolution(
  canvas: OffscreenCanvas,
  totalFrames: number,
  renderFrameFn: (frameIndex: number, width: number, height: number) => void,
  settings: EncoderSettings,
  onProgress?: (progress: number) => void,
  audioFile?: File
): Promise<Blob> {

  const { width, height, fps, bitrate } = settings;

  canvas.width = width;
  canvas.height = height;

  const frameDuration = 1_000_000 / fps;

  const target = new ArrayBufferTarget();

  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width,
      height
    },
    ...(audioFile ? {
      audio: {
        codec: "aac",
        sampleRate: 44100,
        numberOfChannels: 2
      }
    } : {}),
    fastStart: "in-memory"
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      console.error("VideoEncoder error:", e);
      throw new Error("VideoEncoder error: " + e.message);
    }
  });

  encoder.configure({
    codec: "avc1.640028",
    width,
    height,
    bitrate,
    framerate: fps
  });

  let audioEncoder: AudioEncoder | null = null;
  if (audioFile) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
      },
      error: (e) => {
        console.error("AudioEncoder error:", e);
        throw new Error("AudioEncoder error: " + e.message);
      }
    });

    audioEncoder.configure({
      codec: "mp4a.40.2", // AAC LC
      sampleRate: 44100,
      numberOfChannels: 2,
      bitrate: 128000
    });
  }

  console.log("Starting encoding...");

  let frameIndex = 0;

  try {

    for (frameIndex = 0; frameIndex < totalFrames; frameIndex++) {

      renderFrameFn(frameIndex, width, height);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.floor(frameIndex * frameDuration)
      });

      const keyFrame = frameIndex % (fps * 2) === 0;

      encoder.encode(frame, { keyFrame });

      frame.close();

      // Backpressure protection
      while (encoder.encodeQueueSize > 20) {
        await new Promise(r => setTimeout(r, 1));
      }

      if (frameIndex % 30 === 0) {
        onProgress?.(frameIndex / totalFrames);
        await new Promise(r => setTimeout(r, 0));
      }

    }

    console.log("Flushing encoder...");

    await encoder.flush();

    await new Promise(r => setTimeout(r, 50));

    // Encode audio if provided
    if (audioFile && audioEncoder) {
      console.log("Encoding audio...");
      const videoDurationMs = (totalFrames / fps) * 1000;
      await encodeAudio(audioFile, audioEncoder, videoDurationMs);
      console.log("Audio encoded");
    }

  } catch (error) {

    console.error(`Frame ${frameIndex} encoding error:`, error);
    throw new Error(`Frame encoding failed at frame ${frameIndex}: ${error}`);

  } finally {

    try {
      encoder.close();
      console.log("Video encoder closed");
    } catch (e) {
      console.warn("Video encoder close warning:", e);
    }

    if (audioEncoder) {
      try {
        audioEncoder.close();
        console.log("Audio encoder closed");
      } catch (e) {
        console.warn("Audio encoder close warning:", e);
      }
    }

    try {
      muxer.finalize();
      console.log("Muxer finalized");
    } catch (e) {
      console.warn("Muxer finalize warning:", e);
    }

  }

  onProgress?.(1);

  return new Blob([target.buffer], { type: "video/mp4" });
}

async function encodeAudio(audioFile: File, audioEncoder: AudioEncoder, videoDurationMs: number): Promise<void> {
  // Decode audio file
  const audioContext = new AudioContext({ sampleRate: 44100 });
  const arrayBuffer = await audioFile.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const numberOfChannels = Math.min(audioBuffer.numberOfChannels, 2);
  const sampleRate = audioBuffer.sampleRate;
  const fullLength = audioBuffer.length;

  // Calculate how many samples we need for the video duration
  const maxSamples = Math.floor((videoDurationMs / 1000) * sampleRate);
  const length = Math.min(fullLength, maxSamples);

  // For interleaved format, we need to interleave the channel data
  const interleavedData = new Float32Array(length * numberOfChannels);
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      interleavedData[i * numberOfChannels + channel] = audioBuffer.getChannelData(channel)[i];
    }
  }

  // Create AudioData with interleaved format
  const audioData = new AudioData({
    format: 'f32',
    sampleRate,
    numberOfChannels,
    numberOfFrames: length,
    timestamp: 0,
    data: interleavedData
  });

  audioEncoder.encode(audioData);
  audioData.close();

  await audioEncoder.flush();
}