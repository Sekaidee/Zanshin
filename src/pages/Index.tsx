import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Play, Pause, Download, Music, Gamepad2, AlertCircle, Check, Heart, Image as ImageIcon, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(60);
  const [scrollSpeed, setScrollSpeed] = useState(800);
  const [previewTime, setPreviewTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [suggestedAudioName, setSuggestedAudioName] = useState<string>('');
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null);
  const [backgroundImageElement, setBackgroundImageElement] = useState<HTMLImageElement | null>(null);
  const [backgroundDim, setBackgroundDim] = useState(80);
  const [videoResolution, setVideoResolution] = useState<'1080p' | '720p' | '480p'>('1080p');
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [styleType, setStyleType] = useState<'zanshin' | 'skin'>('zanshin');
  const [noteColors, setNoteColors] = useState({
    key1: '#ff6b9d',
    key2: '#51e5ff',
    key3: '#51e5ff',
    key4: '#ff6b9d'
  });
  const [tempNoteColors, setTempNoteColors] = useState({
    key1: '#ff6b9d',
    key2: '#51e5ff',
    key3: '#51e5ff',
    key4: '#ff6b9d'
  });

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

  const handleBackgroundImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const img = new Image();
    img.onload = () => {
      setBackgroundImageElement(img);
    };
    img.src = URL.createObjectURL(file);
    
    setBackgroundImage(file);
    setError(null);
    setVideoBlob(null);
  }, []);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const osuInputRef = useRef<HTMLInputElement>(null);
  const osrInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
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
    renderFrame(ctx, time, beatmap.notes, replay?.frames || [], 640, 360, scrollSpeed, backgroundImageElement || undefined, backgroundDim, noteColors);
  }, [beatmap, replay, scrollSpeed, previewTime, playing, backgroundImageElement, backgroundDim, noteColors]);

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
        renderFrame(ctx, time, beatmap.notes, replay?.frames || [], 640, 360, scrollSpeed, backgroundImageElement || undefined, backgroundDim, noteColors);
        return next;
      });
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (audioElement) audioElement.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, beatmap, replay, scrollSpeed, audioElement, backgroundImageElement, backgroundDim, noteColors]);

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
      // Get resolution settings
      const resolutions = {
        '1080p': { width: 1920, height: 1080 },
        '720p': { width: 1280, height: 720 },
        '480p': { width: 854, height: 480 }
      };
      
      const selectedRes = resolutions[videoResolution];
      const width = selectedRes.width;
      const height = selectedRes.height;
      
      const duration = getMapDuration(beatmap.notes);
      const totalFrames = Math.ceil((duration / 1000) * fps);

      const offscreen = new OffscreenCanvas(width, height);
      const ctx = offscreen.getContext('2d')!;

      const replayFrames = replay?.frames || [];

      // Load background image for video rendering
      let backgroundBitmap: ImageBitmap | undefined;
      if (backgroundImage) {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = URL.createObjectURL(backgroundImage);
        });
        backgroundBitmap = await createImageBitmap(img);
      }

      console.log(`Starting render at ${width}x${height}...`);
      const result = await encodeVideo(
        offscreen,
        totalFrames,
        (frameIndex, targetWidth, targetHeight) => {
          const time = (frameIndex / fps) * 1000;
          renderFrame(ctx, time, beatmap.notes, replayFrames, targetWidth, targetHeight, scrollSpeed, backgroundBitmap, backgroundDim, noteColors);
        },
        { width, height, fps, bitrate: videoResolution === '1080p' ? 8_000_000 : videoResolution === '720p' ? 4_000_000 : 2_000_000 },
        setProgress,
        audioFile || undefined
      );

      const { blob } = result;

      setVideoBlob(blob);
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
  }, [beatmap, replay, fps, scrollSpeed, audioFile, backgroundImage, backgroundDim, videoResolution, noteColors]);

  const handleDownload = useCallback(() => {
    if (!videoBlob) return;
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = url;
    const resolutions = {
      '1080p': { width: 1920, height: 1080 },
      '720p': { width: 1280, height: 720 },
      '480p': { width: 854, height: 480 }
    };
    const selectedRes = resolutions[videoResolution];
    const resolution = ` (${selectedRes.width}x${selectedRes.height})`;
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
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <img src={zanshinLogo} alt="Zanshin" className="h-7 w-7" />
          <Link to="/" className="text-xl font-bold tracking-tight text-foreground hover:text-primary transition-colors">
            Zanshin<span className="text-primary">残心</span>
          </Link>
        </div>
      </header>

      {/* 4Keys support note */}
      <div className="mx-auto max-w-7xl px-6 py-4">
        <div className="rounded-lg border-2 border-primary/50 bg-primary/5 px-4 py-2 text-center text-sm font-medium text-primary shadow-lg shadow-primary/20">
          This app supports only 4Keys
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Panel - File Selection Steps */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-lg font-semibold text-foreground mb-6">Select Files</h2>
            
            {/* Step 1: Select Replay */}
            <Card className={`cursor-pointer transition-all ${replay ? 'border-accent bg-accent/5' : 'hover:border-accent/40 hover:glow-accent'}`} onClick={() => osrInputRef.current?.click()}>
              <CardContent className="flex items-center gap-4 p-4">
                <input ref={osrInputRef} type="file" accept=".osr" onChange={handleOsrFile} className="hidden" />
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${replay ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground'}`}>
                  1
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Gamepad2 className={`h-5 w-5 ${replay ? 'text-accent' : 'text-muted-foreground'}`} />
                    <span className={`font-medium ${replay ? 'text-accent' : 'text-muted-foreground'}`}>Select Replay</span>
                    {replay && <Check className="h-4 w-4 text-accent" />}
                  </div>
                  <p className="text-xs text-muted-foreground">.osr file</p>
                  {replay && (
                    <p className="text-xs text-accent mt-1 truncate">{replay.playerName}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Select Osu File */}
            <Card className={`cursor-pointer transition-all ${beatmap ? 'border-primary bg-primary/5' : 'hover:border-primary/40 hover:glow-primary'}`} onClick={() => osuInputRef.current?.click()}>
              <CardContent className="flex items-center gap-4 p-4">
                <input ref={osuInputRef} type="file" accept=".osu" onChange={handleOsuFile} className="hidden" />
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${beatmap ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                  2
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Music className={`h-5 w-5 ${beatmap ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`font-medium ${beatmap ? 'text-primary' : 'text-muted-foreground'}`}>Select Osu File</span>
                    {beatmap && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">.osu (osu!mania 4K)</p>
                  {beatmap && (
                    <p className="text-xs text-primary mt-1 truncate">{beatmap.artist} - {beatmap.title}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Step 3: Select Audio */}
            <Card className={`cursor-pointer transition-all ${audioFile ? 'border-green-500 bg-green-500/5' : 'hover:border-green-500/40 hover:glow-green-500'}`} onClick={() => audioInputRef.current?.click()}>
              <CardContent className="flex items-center gap-4 p-4">
                <input ref={audioInputRef} type="file" accept=".mp3,.wav,.ogg" onChange={handleAudioFile} className="hidden" />
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${audioFile ? 'bg-green-500 text-white' : 'bg-secondary text-muted-foreground'}`}>
                  3
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Music className={`h-5 w-5 ${audioFile ? 'text-green-500' : 'text-muted-foreground'}`} />
                    <span className={`font-medium ${audioFile ? 'text-green-500' : 'text-muted-foreground'}`}>Select Audio</span>
                    {audioFile && <Check className="h-4 w-4 text-green-500" />}
                  </div>
                  <p className="text-xs text-muted-foreground">.mp3/.wav/.ogg</p>
                  {suggestedAudioName && !audioFile && (
                    <p className="text-xs text-blue-500 mt-1">Suggested: {suggestedAudioName}</p>
                  )}
                  {audioFile && (
                    <p className="text-xs text-green-500 mt-1 truncate">{audioFile.name}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Step 4: Select Background Image */}
            <Card className={`cursor-pointer transition-all ${backgroundImage ? 'border-purple-500 bg-purple-500/5' : 'hover:border-purple-500/40 hover:glow-purple-500'}`} onClick={() => backgroundInputRef.current?.click()}>
              <CardContent className="flex items-center gap-4 p-4">
                <input ref={backgroundInputRef} type="file" accept="image/*" onChange={handleBackgroundImage} className="hidden" />
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${backgroundImage ? 'bg-purple-500 text-white' : 'bg-secondary text-muted-foreground'}`}>
                  4
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <ImageIcon className={`h-5 w-5 ${backgroundImage ? 'text-purple-500' : 'text-muted-foreground'}`} />
                    <span className={`font-medium ${backgroundImage ? 'text-purple-500' : 'text-muted-foreground'}`}>Background Image</span>
                    {backgroundImage && <Check className="h-4 w-4 text-purple-500" />}
                  </div>
                  <p className="text-xs text-muted-foreground">.png/.jpg/.jpeg</p>
                  {backgroundImage && (
                    <p className="text-xs text-purple-500 mt-1 truncate">{backgroundImage.name}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Preview and Settings */}
          <div className="lg:col-span-2 space-y-6">
            {/* Error display */}
            {error && (
              <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-slide-up">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Preview */}
            <Card className="animate-slide-up overflow-hidden">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Preview</h2>
                  <Dialog open={customizationOpen} onOpenChange={(open) => {
                    setCustomizationOpen(open);
                    if (open) {
                      // Initialize temp colors when opening
                      setTempNoteColors(noteColors);
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Card className="cursor-pointer transition-all hover:border-primary/40 hover:glow-primary">
                        <CardContent className="flex items-center gap-2 p-2">
                          <Palette className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">Style</span>
                        </CardContent>
                      </Card>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Visual Customizations</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="style-type">Style Type</Label>
                          <Select value={styleType} onValueChange={(value: 'zanshin' | 'skin') => setStyleType(value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="zanshin">Zanshin Style</SelectItem>
                              <SelectItem value="skin" disabled>Skin Style (Soon)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {styleType === 'zanshin' && (
                          <div className="space-y-3">
                            <Label>Note Colors</Label>
                            <div className="grid grid-cols-4 gap-3">
                              <div className="space-y-1">
                                <Label htmlFor="key1" className="text-xs text-center">Key 1</Label>
                                <input
                                  id="key1"
                                  type="color"
                                  value={tempNoteColors.key1}
                                  onChange={(e) => setTempNoteColors(prev => ({ ...prev, key1: e.target.value }))}
                                  className="w-full h-8 rounded border border-border"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="key2" className="text-xs text-center">Key 2</Label>
                                <input
                                  id="key2"
                                  type="color"
                                  value={tempNoteColors.key2}
                                  onChange={(e) => setTempNoteColors(prev => ({ ...prev, key2: e.target.value }))}
                                  className="w-full h-8 rounded border border-border"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="key3" className="text-xs text-center">Key 3</Label>
                                <input
                                  id="key3"
                                  type="color"
                                  value={tempNoteColors.key3}
                                  onChange={(e) => setTempNoteColors(prev => ({ ...prev, key3: e.target.value }))}
                                  className="w-full h-8 rounded border border-border"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="key4" className="text-xs text-center">Key 4</Label>
                                <input
                                  id="key4"
                                  type="color"
                                  value={tempNoteColors.key4}
                                  onChange={(e) => setTempNoteColors(prev => ({ ...prev, key4: e.target.value }))}
                                  className="w-full h-8 rounded border border-border"
                                />
                              </div>
                            </div>
                            
                            {backgroundImage && (
                              <div className="pt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    if (!backgroundImage) return;
                                    
                                    try {
                                      const img = new Image();
                                      await new Promise((resolve, reject) => {
                                        img.onload = resolve;
                                        img.onerror = reject;
                                        img.src = URL.createObjectURL(backgroundImage);
                                      });
                                      
                                      const canvas = document.createElement('canvas');
                                      const ctx = canvas.getContext('2d')!;
                                      canvas.width = Math.min(img.width, 200); // Downsample for performance
                                      canvas.height = Math.min(img.height, 200);
                                      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                      
                                      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                      const data = imageData.data;
                                      
                                      // Simple color extraction - find most frequent non-black colors
                                      const colorMap: { [key: string]: { rgb: [number, number, number], count: number } } = {};
                                      
                                      // Sample pixels (every 4th pixel for performance)
                                      for (let i = 0; i < data.length; i += 16) { // Skip every 4 pixels
                                        const r = data[i];
                                        const g = data[i + 1];
                                        const b = data[i + 2];
                                        const alpha = data[i + 3];
                                        
                                        // Skip transparent pixels
                                        if (alpha < 128) continue;
                                        
                                        // Skip very dark colors (black-like)
                                        const brightness = (r + g + b) / 3;
                                        if (brightness < 30) continue;
                                        
                                        // Skip very light colors (white-like)
                                        if (brightness > 225) continue;
                                        
                                        // Skip gray colors (low saturation)
                                        const max = Math.max(r, g, b);
                                        const min = Math.min(r, g, b);
                                        const saturation = max === 0 ? 0 : (max - min) / max;
                                        if (saturation < 0.1) continue;
                                        
                                        // Quantize to reduce color variations (group similar colors)
                                        const quantizedR = Math.round(r / 25) * 25;
                                        const quantizedG = Math.round(g / 25) * 25;
                                        const quantizedB = Math.round(b / 25) * 25;
                                        
                                        const key = `${quantizedR},${quantizedG},${quantizedB}`;
                                        
                                        if (colorMap[key]) {
                                          colorMap[key].count++;
                                        } else {
                                          colorMap[key] = {
                                            rgb: [r, g, b], // Store original RGB for better color
                                            count: 1
                                          };
                                        }
                                      }
                                      
                                      // Get the two most frequent colors
                                      const sortedColors = Object.values(colorMap)
                                        .sort((a, b) => b.count - a.count)
                                        .slice(0, 2);
                                      
                                      if (sortedColors.length >= 2) {
                                        const primaryRGB = sortedColors[0].rgb;
                                        const secondaryRGB = sortedColors[1].rgb;
                                        
                                        const primaryColor = `rgb(${primaryRGB[0]}, ${primaryRGB[1]}, ${primaryRGB[2]})`;
                                        const secondaryColor = `rgb(${secondaryRGB[0]}, ${secondaryRGB[1]}, ${secondaryRGB[2]})`;
                                        
                                        setTempNoteColors({
                                          key1: primaryColor,
                                          key2: secondaryColor,
                                          key3: secondaryColor,
                                          key4: primaryColor
                                        });
                                      } else if (sortedColors.length === 1) {
                                        // Fallback: use complementary colors
                                        const rgb = sortedColors[0].rgb;
                                        const primaryColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
                                        
                                        // Create a complementary color by shifting hue
                                        const complementaryR = 255 - rgb[0];
                                        const complementaryG = 255 - rgb[1];
                                        const complementaryB = 255 - rgb[2];
                                        const secondaryColor = `rgb(${complementaryR}, ${complementaryG}, ${complementaryB})`;
                                        
                                        setTempNoteColors({
                                          key1: primaryColor,
                                          key2: secondaryColor,
                                          key3: secondaryColor,
                                          key4: primaryColor
                                        });
                                      }
                                    } catch (error) {
                                      console.error('Failed to extract colors from background:', error);
                                    }
                                  }}
                                  className="w-full"
                                >
                                  <ImageIcon className="h-4 w-4 mr-2" />
                                  Get Accent Colors from Background
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                        
                        <div className="flex justify-end pt-4">
                          <Button onClick={() => {
                            setNoteColors(tempNoteColors);
                            setCustomizationOpen(false);
                          }}>Save</Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="flex justify-center rounded-lg bg-secondary/30 p-2">
                  {beatmap ? (
                    <canvas
                      ref={previewCanvasRef}
                      className="rounded"
                      style={{ width: '100%', maxWidth: 640, aspectRatio: '16/9' }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full aspect-video bg-secondary/50 rounded text-muted-foreground">
                      <Upload className="h-12 w-12 mb-2 opacity-50" />
                      <p className="text-sm">Select files to preview</p>
                    </div>
                  )}
                </div>
                {beatmap && (
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
                )}
              </CardContent>
            </Card>

            {/* Render Settings */}
            {beatmap && (
              <Card className="animate-slide-up">
                <CardContent className="p-4 space-y-4">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Render Settings</h2>
                  <div className="grid grid-cols-2 gap-6">
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
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Background Dim</span>
                        <span className="text-foreground font-mono">{backgroundDim}%</span>
                      </div>
                      <Slider
                        value={[backgroundDim]}
                        onValueChange={([v]) => setBackgroundDim(v)}
                        min={0}
                        max={100}
                        step={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Resolution</span>
                        <span className="text-foreground font-mono">{videoResolution}</span>
                      </div>
                      <Select value={videoResolution} onValueChange={(value: '1080p' | '720p' | '480p') => setVideoResolution(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1080p">1080p (1920×1080)</SelectItem>
                          <SelectItem value="720p" disabled>720p (1280×720) - Soon</SelectItem>
                          <SelectItem value="480p" disabled>480p (854×480) - Soon</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Resolution: {videoResolution === '1080p' ? '1920×1080' : videoResolution === '720p' ? '1280×720' : '854×480'}</span>
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
                
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bottom bubble */}
      <div className="fixed bottom-4 left-4 z-40">
        <div className="rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground shadow-lg border border-border/50 flex items-center gap-2">
          <span>Made with</span>
          <Heart className="h-4 w-4 text-red-500 fill-current" />
          <a
            href="https://discord.com/users/764107134119051294"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            Sekaide
          </a>
        </div>
      </div>
    </div>
  );
};

export default Index;
