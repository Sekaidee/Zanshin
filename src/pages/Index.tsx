import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Play, Pause, Download, Music, Gamepad2, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { parseOsuFile, BeatmapInfo } from '@/lib/osu-parser';
import { parseOsrFile, ReplayInfo } from '@/lib/osr-parser';
import { renderFrame, getMapDuration } from '@/lib/mania-renderer';
import { encodeVideo, isWebCodecsSupported } from '@/lib/video-encoder';
import zanshinLogo from '@/assets/Zanshin.png';

const Index = () => {
  const [beatmap, setBeatmap] = useState<BeatmapInfo | null>(null);
  const [replay, setReplay] = useState<ReplayInfo | null>(null);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoResolution, setVideoResolution] = useState<{width: number, height: number} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(60);
  const [scrollSpeed, setScrollSpeed] = useState(800);
  const [previewTime, setPreviewTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [suggestedAudioName, setSuggestedAudioName] = useState<string>('');

  const handleOsuFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const info = parseOsuFile(text);
      if (info.mode !== 3) {
        setError('This beatmap is not an osu!mania map (Mode must be 3)');
        return;
      }
      if (info.keyCount !== 4) {
        setError(`Only 4K beatmaps are supported. This map is ${info.keyCount}K.`);
        return;
      }
      setBeatmap(info);
      setSuggestedAudioName(info.audioFilename || '');
      setError(null);
      setVideoBlob(null);
    } catch {
      setError('Failed to parse .osu file');
    }
  }, []);

  const handleAudioFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    const audio = new Audio(URL.createObjectURL(file));
    setAudioElement(audio);
    setError(null);
    setVideoBlob(null);
  }, []);

  const handleOsrFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const info = await parseOsrFile(buffer);
      setReplay(info);
      setError(null);
      setVideoBlob(null);
    } catch {
      setError('Failed to parse .osr file. Make sure it\'s a valid replay file.');
    }
  }, []);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const osuInputRef = useRef<HTMLInputElement>(null);
  const osrInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Preview rendering (static)
  useEffect(() => {
    if (playing) return;
    if (!beatmap || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 640;
    canvas.height = 360;

    const duration = getMapDuration(beatmap.notes);
    const time = (previewTime / 100) * duration;
    renderFrame(ctx, time, beatmap.notes, replay?.frames || [], 640, 360, scrollSpeed);
  }, [beatmap, replay, scrollSpeed, previewTime, playing]);

  // Playback loop
  useEffect(() => {
    if (!playing || !beatmap || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 640;
    canvas.height = 360;
    const duration = getMapDuration(beatmap.notes);
    lastTimeRef.current = performance.now();

    if (audioElement) {
      audioElement.currentTime = (previewTime / 100) * (audioElement.duration || duration / 1000);
      audioElement.play();
    }

    const tick = (now: number) => {
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;
      setPreviewTime(prev => {
        const next = prev + (delta / duration) * 100;
        if (next >= 100) {
          setPlaying(false);
          if (audioElement) audioElement.pause();
          return 100;
        }
        const time = (next / 100) * duration;
        renderFrame(ctx, time, beatmap.notes, replay?.frames || [], 640, 360, scrollSpeed);
        return next;
      });
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (audioElement) audioElement.pause();
    };
  }, [playing, beatmap, replay, scrollSpeed, audioElement]);

  const handleRender = useCallback(async () => {
    if (!beatmap) return;
    if (!isWebCodecsSupported()) {
      setError('WebCodecs API not supported. Please use Chrome or Edge browser.');
      return;
    }

    setRendering(true);
    setProgress(0);
    setVideoBlob(null);
    setError(null);

    try {
      // Try 1080p first, encoder will fallback to 720p if needed
      const width = 1920;
      const height = 1080;
      const duration = getMapDuration(beatmap.notes);
      const totalFrames = Math.ceil((duration / 1000) * fps);

      const offscreen = new OffscreenCanvas(width, height);
      const ctx = offscreen.getContext('2d')!;

      const replayFrames = replay?.frames || [];

      console.log(`Starting render at ${width}x${height}...`);
      const result = await encodeVideo(
        offscreen,
        totalFrames,
        (frameIndex, targetWidth, targetHeight) => {
          const time = (frameIndex / fps) * 1000;
          renderFrame(ctx, time, beatmap.notes, replayFrames, targetWidth, targetHeight, scrollSpeed);
        },
        { width, height, fps, bitrate: 8_000_000 },
        setProgress,
        audioFile || undefined
      );

      const { blob } = result;

      setVideoBlob(blob);
      setVideoResolution({ width: result.width, height: result.height });
      // Auto-download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${beatmap?.artist} - ${beatmap?.title} [${beatmap?.version}] (${result.width}x${result.height}).mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Rendering failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRendering(false);
    }
  }, [beatmap, replay, fps, scrollSpeed]);

  const handleDownload = useCallback(() => {
    if (!videoBlob) return;
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = url;
    const resolution = videoResolution ? ` (${videoResolution.width}x${videoResolution.height})` : '';
    a.download = `${beatmap?.artist} - ${beatmap?.title} [${beatmap?.version}]${resolution}.mp4`;
    a.click();
    URL.revokeObjectURL(url);
  }, [videoBlob, beatmap, videoResolution]);

  const mapDuration = beatmap ? getMapDuration(beatmap.notes) : 0;
  const estimatedFrames = Math.ceil((mapDuration / 1000) * fps);
  const estimatedSeconds = Math.ceil(estimatedFrames / fps);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <img src={zanshinLogo} alt="Zanshin" className="h-7 w-7" />
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Zanshin<span className="text-primary">残心</span>
          </h1>
          <span className="ml-2 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">Supports 4Keys</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        {/* Error display */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-slide-up">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* File upload cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* .osu upload */}
          <Card
            className="cursor-pointer transition-all hover:border-primary/40 hover:glow-primary"
            onClick={() => osuInputRef.current?.click()}
          >
            <CardContent className="flex flex-col items-center gap-3 py-8">
              <input ref={osuInputRef} type="file" accept=".osu" onChange={handleOsuFile} className="hidden" />
              <div className="rounded-xl bg-secondary p-3">
                <Music className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">Beatmap File</p>
                <p className="text-sm text-muted-foreground">.osu (osu!mania 4K)</p>
              </div>
              {beatmap && (
                <div className="mt-2 w-full space-y-1 rounded-lg bg-secondary/50 px-4 py-3 text-sm animate-slide-up">
                  <div className="flex items-center gap-2 text-primary">
                    <Check className="h-3.5 w-3.5" />
                    <span className="font-medium">Loaded</span>
                  </div>
                  <p className="text-foreground">{beatmap.artist} - {beatmap.title}</p>
                  <p className="text-muted-foreground">[{beatmap.version}] by {beatmap.creator}</p>
                  <p className="text-muted-foreground">{beatmap.notes.length} notes</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* .osr upload */}
          <Card
            className="cursor-pointer transition-all hover:border-accent/40 hover:glow-accent"
            onClick={() => osrInputRef.current?.click()}
          >
            <CardContent className="flex flex-col items-center gap-3 py-8">
              <input ref={osrInputRef} type="file" accept=".osr" onChange={handleOsrFile} className="hidden" />
              <div className="rounded-xl bg-secondary p-3">
                <Gamepad2 className="h-6 w-6 text-accent" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">Replay File</p>
                <p className="text-sm text-muted-foreground">.osr</p>
              </div>
              {replay && (
                <div className="mt-2 w-full space-y-1 rounded-lg bg-secondary/50 px-4 py-3 text-sm animate-slide-up">
                  <div className="flex items-center gap-2 text-accent">
                    <Check className="h-3.5 w-3.5" />
                    <span className="font-medium">Loaded</span>
                  </div>
                  <p className="text-foreground">Player: {replay.playerName}</p>
                  <p className="text-muted-foreground">Score: {replay.score.toLocaleString()} • {replay.maxCombo}x combo</p>
                  <p className="text-muted-foreground">{replay.frames.length} replay frames</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audio upload */}
          <Card
            className="cursor-pointer transition-all hover:border-green-500/40 hover:glow-green-500"
            onClick={() => audioInputRef.current?.click()}
          >
            <CardContent className="flex flex-col items-center gap-3 py-8">
              <input ref={audioInputRef} type="file" accept=".mp3,.wav,.ogg" onChange={handleAudioFile} className="hidden" />
              <div className="rounded-xl bg-secondary p-3">
                <Music className="h-6 w-6 text-green-500" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">Audio File</p>
                <p className="text-sm text-muted-foreground">.mp3/.wav/.ogg</p>
                {suggestedAudioName && !audioFile && (
                  <p className="text-xs text-blue-500 mt-1">Suggested: {suggestedAudioName}</p>
                )}
              </div>
              {audioFile && (
                <div className="mt-2 w-full space-y-1 rounded-lg bg-secondary/50 px-4 py-3 text-sm animate-slide-up">
                  <div className="flex items-center gap-2 text-green-500">
                    <Check className="h-3.5 w-3.5" />
                    <span className="font-medium">Loaded</span>
                  </div>
                  <p className="text-foreground">{audioFile.name}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        {beatmap && (
          <Card className="animate-slide-up overflow-hidden">
            <CardContent className="p-4 space-y-4">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Preview</h2>
              <div className="flex justify-center rounded-lg bg-secondary/30 p-2">
                <canvas
                  ref={previewCanvasRef}
                  className="rounded"
                  style={{ width: '100%', maxWidth: 640, aspectRatio: '16/9' }}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => {
                    if (previewTime >= 100) setPreviewTime(0);
                    setPlaying(p => !p);
                  }}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <div className="flex-1 space-y-1">
                  <Slider
                    value={[previewTime]}
                    onValueChange={([v]) => { setPlaying(false); setPreviewTime(v); }}
                    min={0}
                    max={100}
                    step={0.5}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings */}
        {beatmap && (
          <Card className="animate-slide-up">
            <CardContent className="p-4 space-y-4">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Render Settings</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">FPS</span>
                    <span className="text-foreground font-mono">{fps}</span>
                  </div>
                  <Slider
                    value={[fps]}
                    onValueChange={([v]) => setFps(v)}
                    min={24}
                    max={60}
                    step={6}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Scroll Speed</span>
                    <span className="text-foreground font-mono">{scrollSpeed}ms</span>
                  </div>
                  <Slider
                    value={[scrollSpeed]}
                    onValueChange={([v]) => setScrollSpeed(v)}
                    min={300}
                    max={1500}
                    step={50}
                  />
                </div>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Resolution: 1920×1080</span>
                <span>•</span>
                <span>Duration: {Math.floor(estimatedSeconds / 60)}:{(estimatedSeconds % 60).toString().padStart(2, '0')}</span>
                <span>•</span>
                <span>{estimatedFrames.toLocaleString()} frames</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Render controls */}
        {beatmap && (
          <div className="space-y-4 animate-slide-up">
            {rendering ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{progress >= 1 ? 'Rendered' : 'Rendering...'}</span>
                  <span className="font-mono text-primary">{Math.round(progress * 100)}%</span>
                </div>
                <Progress value={progress * 100} className="h-2" />
              </div>
            ) : (
              <div className="flex gap-3">
                <Button
                  size="lg"
                  onClick={handleRender}
                  disabled={!beatmap}
                  className="gap-2"
                >
                  <Play className="h-4 w-4" />
                  Render Video
                </Button>
                {videoBlob && (
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleDownload}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download MP4 ({(videoBlob.size / 1024 / 1024).toFixed(1)} MB)
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!beatmap && !error && (
          <div className="py-16 text-center text-muted-foreground animate-slide-up">
            <Upload className="mx-auto mb-4 h-12 w-12 opacity-30" />
            <p className="text-lg">Upload a beatmap to get started</p>
            <p className="text-sm mt-1">Load a .osu file and optionally a .osr replay</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
