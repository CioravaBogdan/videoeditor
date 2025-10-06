# n8n Simple Format Integration

## Overview
This document provides the correct n8n Code node implementation for the VideoEditor API using the **simple format** (not editSpec). This format is optimized for the current worker implementation and avoids path resolution issues.

## Key Changes from Previous Implementation

### Path Resolution Fix
- **Problem**: Sending absolute paths like `/uploads/file.mov` caused the worker to create `/uploads/uploads/file.mov`
- **Solution**: Send **relative paths** (without `/uploads/` prefix) so the worker correctly resolves them

### Format Simplification
- **Removed**: `editSpec`, layers (video/image-overlay/title/fill-color), `audioTracks`
- **Using**: Simple `clips` array with `path` or `imagePath` and `duration`
- **Audio**: Single `audioFilePath` for external audio (replaces video audio completely)

## n8n Code Node Implementation

Place this Code node **after** your Merge node and **before** the HTTP Request node to `/jobs`:

```javascript
// Payload simplu pentru /jobs (fără editSpec). Trimite căi RELATIVE (fără /uploads).
const items = $input.all().map(x => x.json || {});
const pick = (o, k) => (o && o[k] !== undefined ? o[k] : undefined);

const toUploads = (p) => {
  if (!p) return '';
  const u = String(p).replace(/\\/g, '/');
  const i = u.indexOf('/uploads/');
  if (i >= 0) return u.slice(i); // normalizează la /uploads/…
  return u.replace(/\/app\/uploads/gi, '/uploads');
};

// IMPORTANT: convertește la căi relative pentru worker (fără /uploads/)
const toWorkerRel = (p) => {
  const u = toUploads(p);
  const m = u.match(/\/uploads\/(.+)$/i);
  if (m && m[1]) return m[1];     // ex: /uploads/file.ext -> file.ext
  return u.replace(/^\/+/, '');   // fallback: scoate eventuale /
};

const isVideo = (s='') => /\.(mp4|mov|m4v|avi|webm|mkv)$/i.test(s);
const isAudio = (s='') => /\.(wav|mp3|m4a|aac|ogg)$/i.test(s);
const isImage = (s='') => /\.(png|jpe?g|webp|gif|bmp)$/i.test(s);
const num = (v, d=0) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  return Number.isFinite(n) ? n : d;
};

// Adună fișiere din toate itemele
const allFiles = [];
for (const j of items) {
  if (Array.isArray(j.files)) allFiles.push(...j.files);
  if (j.files && typeof j.files === 'object' && !Array.isArray(j.files)) {
    for (const k of ['video','audio','logo','image','images']) {
      const v = j.files[k];
      if (!v) continue;
      if (Array.isArray(v)) allFiles.push(...v); else allFiles.push(v);
    }
  }
  if (j.filename && (j.path || j.url)) allFiles.push(j);
  if (j.video && (j.filename || j.path)) allFiles.push(j);
}

const norm = (f) => {
  const filename = f.filename || f.originalName || '';
  const pathN = toUploads(f.path || (filename ? `/uploads/${filename}` : f.url || ''));
  const url = toUploads(f.url || '');
  const key = filename || pathN || url || '';
  const ext = key.split('?')[0];
  const duration = num(f.duration ?? f.video?.duration ?? 0, 0);
  const type = f.type || (isVideo(ext) ? 'video' : isAudio(ext) ? 'audio' : isImage(ext) ? 'image' : 'other');
  return { raw: f, filename, path: pathN, url, duration, type };
};

const filesN = allFiles.map(norm);

// Alege video / audio / imagini
const videoCandidates = filesN.filter(f => f.type === 'video' || isVideo(f.filename || f.path || f.url))
  .sort((a,b) => (b.duration - a.duration));
const video = videoCandidates[0] || null;

const audioCandidates = filesN.filter(f => f.type === 'audio' || isAudio(f.filename || f.path || f.url));
const audio = audioCandidates[0] || null;

const imageCandidates = filesN.filter(f => f.type === 'image' || isImage(f.filename || f.path || f.url));

// Business params
const base = Object.assign({}, ...items);
const stil = (pick(base,'stil') || 'jucaus').toLowerCase();
const pret = num(pick(base,'pret') ?? pick(base,'produs')?.pret ?? 299, 299);
const moneda = pick(base,'moneda') || pick(base,'produs')?.moneda || 'RON';
const ean = pick(base,'ean') || pick(base,'produs')?.ean || `${Date.now()}`;

// Output settings
const width = 1080, height = 1920, fps = 30;

// 1) VIDEO + (opțional) AUDIO
if (video) {
  const requestedVideoDuration = Math.max(1, num(pick(base,'videoDuration') ?? video.duration ?? 7, 7));
  const effectiveVideoDuration = video.duration ? Math.min(requestedVideoDuration, video.duration) : requestedVideoDuration;

  const job = {
    width, height, fps,
    outputFilename: `INFANT_${stil.toUpperCase()}_${pret}${moneda}_${ean}.mp4`,
    clips: [
      {
        path: toWorkerRel(video.path || video.url),          // RELATIV
        duration: +effectiveVideoDuration.toFixed(3)
      }
    ]
  };

  if (audio) job.audioFilePath = toWorkerRel(audio.path || audio.url); // RELATIV

  return [{
    json: {
      ...job,
      _debug: {
        mode: 'simple-video',
        chosen: {
          video: job.clips[0].path,
          audio: job.audioFilePath || null
        },
        candidates: {
          videos: videoCandidates.map(v => ({ path: toWorkerRel(v.path || v.url), duration: v.duration })),
          audios: audioCandidates.map(a => ({ path: toWorkerRel(a.path || a.url) }))
        },
        durations: { requestedVideoDuration, effectiveVideoDuration }
      }
    }
  }];
}

// 2) IMAGINI + (opțional) AUDIO
if (imageCandidates.length > 0) {
  const perImage = Math.max(1, num(pick(base,'imageDuration') ?? 4, 4));
  const clips = imageCandidates.map(img => ({
    imagePath: toWorkerRel(img.path || img.url), // RELATIV
    duration: perImage
  }));

  const job = {
    width, height, fps,
    outputFilename: `INFANT_SLIDESHOW_${pret}${moneda}_${ean}.mp4`,
    clips
  };

  if (audio) job.audioFilePath = toWorkerRel(audio.path || audio.url); // RELATIV

  return [{
    json: {
      ...job,
      _debug: {
        mode: 'simple-images',
        counts: { images: imageCandidates.length },
        chosen: {
          images: clips.map(c => c.imagePath),
          audio: job.audioFilePath || null
        },
        perImage
      }
    }
  }];
}

throw new Error(`Nu am găsit niciun fișier video sau imagine. Fișiere detectate: ${filesN.length}.`);
```

## Expected Output Examples

### For Video + Audio:
```json
{
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "outputFilename": "INFANT_JUCAUS_299RON_1758913954169.mp4",
  "clips": [
    {
      "path": "files-1758911197866-939627667.mov",
      "duration": 11.895
    }
  ],
  "audioFilePath": "files-1758913954049-979372577.wav"
}
```

### For Image Slideshow + Audio:
```json
{
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "outputFilename": "INFANT_SLIDESHOW_299RON_1758913954169.mp4",
  "clips": [
    {
      "imagePath": "image1.jpg",
      "duration": 4
    },
    {
      "imagePath": "image2.jpg",
      "duration": 4
    }
  ],
  "audioFilePath": "audio-file.wav"
}
```

## Worker Behavior

### Simple Format Processing
- **Video clips**: Worker uses `buildVideoFFmpegCommand` which handles video concatenation with trimming
- **Image clips**: Worker uses image concat via FFmpeg's concat demuxer
- **Audio**: Replaces any existing video audio completely with `audioFilePath`
- **No overlays/titles**: Current worker doesn't support text/image overlays in simple format

### Path Resolution
The worker internally does:
```javascript
const fullVideoPath = path.join('/uploads', providedPath);
```

So if you send:
- ✅ `"files-123.mov"` → becomes `/uploads/files-123.mov`
- ❌ `"/uploads/files-123.mov"` → becomes `/uploads/uploads/files-123.mov` (FAIL)

## HTTP Request Node Configuration

**URL**: `http://videoeditor.byinfant.com/jobs` (or `http://localhost:3030/jobs` for local)

**Method**: `POST`

**Body**: JSON

**Body Content Type**: `application/json`

**Body Parameters**:
- Send the entire JSON output from the Code node above

## Troubleshooting

### Error: "Video file not found: /uploads/uploads/..."
**Cause**: Sending absolute paths with `/uploads/` prefix  
**Solution**: Use the `toWorkerRel()` function in the Code node to strip the prefix

### Error: "Invalid data found when processing input"
**Cause**: Editly format being sent (with layers/editSpec)  
**Solution**: Use the simple format Code node above (no editSpec)

### No audio in output video
**Expected**: The worker replaces video audio with `audioFilePath`. If you want to keep original video audio, omit `audioFilePath` from the payload.

### Video duration is wrong
**Check**: The `videoDuration` parameter from your input data. The Code node respects the actual video duration and won't trim beyond it.

## Future Enhancements

To add end-cards, titles, or logo overlays:
1. Pre-render those elements as separate video/image files
2. Add them as additional clips in the `clips` array
3. Worker will concatenate them with the main video

Example:
```javascript
clips: [
  { path: "main-video.mov", duration: 10 },
  { imagePath: "end-card.png", duration: 3 }  // Will show for 3 seconds at the end
]
```

## Testing

1. Update your n8n Code node with the implementation above
2. Test with a sample video + audio input
3. Check worker logs for "Format: Simple" confirmation
4. Verify output video contains the correct trimmed video with replaced audio
5. Download from `/download/INFANT_JUCAUS_*.mp4`

## Migration Notes

**From editSpec format**:
- Remove all `editSpec`, `clips[].layers`, `audioTracks` structures
- Use flat `clips` array with either `path` (video) or `imagePath` (images)
- Use single `audioFilePath` instead of multiple audio tracks
- Text overlays and effects must be pre-rendered into video/image assets

**Path format**:
- Always use relative paths (no `/uploads/` prefix)
- Worker automatically prepends `/uploads/` when resolving files
- Both `path` and `url` properties work (normalized by `toUploads()`)
