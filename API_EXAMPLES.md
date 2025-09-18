# Example API Usage

## Simple Format Job Creation

```bash
# Create a simple render job
curl -X POST http://localhost:3030/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "outputFilename": "test_video.mp4",
    "gpu": false,
    "clips": [
      {
        "imagePath": "/uploads/test1.jpg",
        "duration": 5
      },
      {
        "imagePath": "/uploads/test2.jpg",
        "duration": 7
      }
    ]
  }'
```

## Complex Editly Format Job Creation

```bash
# Create a complex Editly-compatible render job
curl -X POST http://localhost:3030/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "editSpec": {
      "width": 1024,
      "height": 1536,
      "fps": 30,
      "clips": [
        {
          "duration": 13.404438,
          "layers": [
            {
              "type": "image",
              "path": "/uploads/page1.png",
              "resizeMode": "cover",
              "start": 0,
              "stop": 13.404438
            },
            {
              "type": "audio",
              "path": "/uploads/audio1.mp3",
              "start": 0,
              "mixVolume": 1
            }
          ]
        },
        {
          "duration": 9.3555,
          "layers": [
            {
              "type": "image",
              "path": "/uploads/page2.png",
              "resizeMode": "cover",
              "start": 0,
              "stop": 9.3555
            },
            {
              "type": "audio",
              "path": "/uploads/audio2.mp3",
              "start": 0,
              "mixVolume": 1
            }
          ]
        }
      ],
      "outFormat": "mp4",
      "audioCodec": "aac",
      "audioBitrate": "128k",
      "videoCodec": "libx264",
      "videoBitrate": "3000k",
      "customOutputArgs": ["-preset", "medium", "-pix_fmt", "yuv420p"]
    },
    "outputFilename": "complex_video.mp4",
    "stats": {
      "totalPages": 2,
      "totalDuration": "22.76",
      "withAudio": 2,
      "resolution": "1024x1536"
    }
  }'
```

## Check Job Status

```bash
# Replace JOB_ID with actual job ID from creation response
curl http://localhost:3030/jobs/JOB_ID
```

## Health Check

```bash
curl http://localhost:3030/health
```

## Queue Statistics

```bash
curl http://localhost:3030/queue/stats
```

## Download Video

```bash
# Replace FILENAME with actual output filename
curl -o downloaded_video.mp4 http://localhost:3030/download/FILENAME
```

## Cleanup Old Files

```bash
curl -X POST http://localhost:3030/cleanup
```
