# Video Render Queue System

A scalable video rendering system designed to replace Editly with improved performance and GPU acceleration support. This system uses Redis-based job queues to handle multiple concurrent video processing jobs efficiently.

## 🚀 Features

- **Scalable Queue System**: Redis-based job queue with Bull for reliable job processing
- **GPU Acceleration**: NVENC hardware acceleration for fast video encoding
- **Multi-Worker Support**: CPU and GPU workers that can scale independently
- **Webhook Integration**: Real-time notifications to n8n or other systems
- **Auto Cleanup**: Automatic cleanup of old files after configurable time
- **Health Monitoring**: Built-in health checks and queue statistics
- **Docker Ready**: Complete containerization with multi-service support
- **Editly Compatible**: Drop-in replacement with same JSON API format

## 📁 Project Structure

```
video-render-queue/
├── render-api/                 # Express.js API server
│   ├── src/
│   │   ├── server.js          # Main API server
│   │   ├── queue.js           # Redis queue management
│   │   ├── webhook.js         # Webhook notifications
│   │   └── cleanup.js         # File cleanup utilities
│   ├── Dockerfile
│   └── package.json
├── worker/                     # FFmpeg worker service
│   ├── src/
│   │   ├── worker.js          # Queue consumer
│   │   ├── ffmpeg.js          # Video processing logic
│   │   ├── webhook.js         # Worker webhook notifications
│   │   └── cleanup.js         # Worker cleanup utilities
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml          # Production configuration
├── docker-compose.dev.yml      # Development overrides
├── docker-compose.gpu.yml      # GPU-enabled configuration
├── .env                        # Production environment variables
└── .env.development           # Development environment variables
```

## 🛠️ Quick Start

### Prerequisites

- Docker & Docker Compose
- NVIDIA Docker runtime (for GPU support)
- Node.js 18+ (for local development)

### 1. Production Deployment

```bash
# Clone or create the project
git clone <your-repo> video-render-queue
cd video-render-queue

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start all services
docker-compose up -d

# With GPU support (if available)
docker-compose --profile gpu up -d
```

### 2. Development Setup

```bash
# Start with development overrides
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Or run locally (requires Redis)
npm install
npm run dev
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EXTERNAL_DOMAIN` | `http://localhost:3030` | Public domain for file downloads |
| `WEBHOOK_URL` | - | n8n webhook endpoint for notifications |
| `REDIS_HOST` | `redis` | Redis server hostname |
| `REDIS_PORT` | `6379` | Redis server port |
| `CPU_WORKER_REPLICAS` | `4` | Number of CPU workers |
| `GPU_WORKER_REPLICAS` | `0` | Number of GPU workers |
| `AUTO_CLEANUP_ENABLED` | `true` | Enable automatic file cleanup |
| `CLEANUP_AFTER_HOURS` | `2` | Hours before files are cleaned up |

### Scaling Workers

```bash
# Scale CPU workers
docker-compose up -d --scale worker-cpu=6

# Enable GPU workers
docker-compose --profile gpu up -d

# Scale GPU workers (requires GPU profile)
docker-compose --profile gpu up -d --scale worker-gpu=2
```

## 📡 API Endpoints

### Create Render Job
```http
POST /jobs
Content-Type: application/json

{
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "outputFilename": "my_video.mp4",
  "gpu": true,
  "audioFilePath": "/uploads/audio.mp3",
  "clips": [
    {
      "imagePath": "/uploads/image1.jpg",
      "duration": 5
    },
    {
      "imagePath": "/uploads/image2.jpg", 
      "duration": 7
    }
  ]
}
```

**Response:**
```json
{
  "jobId": "uuid-here",
  "status": "queued",
  "message": "Job created successfully"
}
```

### Get Job Status
```http
GET /jobs/{jobId}
```

**Response:**
```json
{
  "id": "uuid-here",
  "status": "completed",
  "progress": 100,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "finishedAt": "2025-01-01T00:05:30.000Z",
  "returnValue": {
    "outputFile": "my_video.mp4",
    "downloadUrl": "https://editly.byinfant.com/download/my_video.mp4",
    "duration": 35.5,
    "fileSize": 15728640,
    "renderTime": 45000
  }
}
```

### Download Video
```http
GET /download/{filename}
```

### Queue Statistics
```http
GET /queue/stats
```

### Health Check
```http
GET /health
```

### Manual Cleanup
```http
POST /cleanup
```

## 🎬 Video Processing

### Supported Input Formats
- **Images**: JPG, PNG, WebP, BMP
- **Audio**: MP3, WAV, AAC, M4A

### Output Format
- **Video**: MP4 (H.264)
- **Audio**: AAC, 128kbps
- **Preset**: Optimized for web streaming

### GPU vs CPU Performance

| Processing Type | Time (10 clips) | Concurrent Jobs |
|----------------|-----------------|-----------------|
| CPU (x264) | ~7 minutes | 4-6 jobs |
| GPU (NVENC) | ~2-3 minutes | 8-12 jobs |

## 🔗 Integration with n8n

### Webhook Configuration

The system sends webhooks for job status updates:

```javascript
// n8n Webhook payload
{
  "jobId": "uuid-here",
  "status": "completed", // started, progress, completed, failed
  "timestamp": "2025-01-01T00:05:30.000Z",
  "workerId": "worker-gpu-abc123",
  "useGpu": true,
  "outputFile": "my_video.mp4",
  "downloadUrl": "https://editly.byinfant.com/download/my_video.mp4",
  "duration": 35.5,
  "fileSize": 15728640,
  "renderTime": 45000
}
```

### n8n Workflow Example

1. **HTTP Request Node**: POST to `/jobs` with video data
2. **Wait Node**: Wait for webhook notification
3. **Switch Node**: Handle success/failure cases
4. **HTTP Request Node**: Download completed video

## 🐳 Docker Commands

### Production
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Scale workers
docker-compose up -d --scale worker-cpu=6

# Stop services
docker-compose down
```

### Development
```bash
# Start with development overrides and live reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Rebuild after code changes
docker-compose build
```

### GPU Support
```bash
# Start with GPU workers
docker-compose --profile gpu up -d

# Check GPU worker logs
docker-compose logs worker-gpu
```

## 📊 Monitoring

### Queue Dashboard
- Active jobs: `GET /queue/stats`
- Worker health: `GET /health`
- Disk usage: `GET /disk-usage`

### Logs
```bash
# API logs
docker-compose logs render-api

# Worker logs
docker-compose logs worker-cpu
docker-compose logs worker-gpu

# Redis logs
docker-compose logs redis
```

## 🔧 Development

### Local Development Setup
```bash
# Install dependencies
cd render-api && npm install
cd ../worker && npm install

# Start Redis (required)
docker run -d -p 6379:6379 redis:7-alpine

# Start API server
cd render-api && npm run dev

# Start worker (in another terminal)
cd worker && npm run dev
```

### Adding New Features

1. **API Endpoints**: Add routes in `render-api/src/server.js`
2. **Worker Logic**: Modify `worker/src/ffmpeg.js`
3. **Queue Management**: Update `render-api/src/queue.js`
4. **Webhooks**: Extend `src/webhook.js` in both services

## 🚨 Troubleshooting

### Common Issues

**GPU Workers Not Starting**
```bash
# Check NVIDIA Docker runtime
nvidia-docker run --rm nvidia/cuda:11.0-base nvidia-smi

# Verify GPU profile is enabled
docker-compose --profile gpu config
```

**Queue Connection Issues**
```bash
# Check Redis connection
docker-compose exec redis redis-cli ping

# Verify Redis logs
docker-compose logs redis
```

**FFmpeg Errors**
```bash
# Check worker logs
docker-compose logs worker-cpu

# Test FFmpeg in container
docker-compose exec worker-cpu ffmpeg -version
```

**High Memory Usage**
```bash
# Monitor resource usage
docker stats

# Adjust worker concurrency
echo "CPU_WORKER_CONCURRENCY=1" >> .env
docker-compose restart worker-cpu
```

### Performance Optimization

1. **Adjust worker concurrency** based on available CPU cores
2. **Use GPU workers** for higher throughput
3. **Enable cleanup** to prevent disk space issues
4. **Monitor queue depth** and scale workers accordingly

## 📝 Migration from Editly

This system is designed as a drop-in replacement for Editly:

1. **Same JSON format**: Use existing job configurations
2. **Same endpoints**: `/edit` becomes `/jobs`
3. **Same download URL**: `/download/{filename}` works unchanged
4. **Enhanced features**: Queue management, GPU support, webhooks

### Migration Steps

1. Deploy this system alongside existing Editly
2. Update n8n workflows to use new endpoints
3. Test with a few jobs to ensure compatibility
4. Gradually migrate all traffic
5. Decommission old Editly instance

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

**Ready to scale your video processing to the next level! 🚀**
