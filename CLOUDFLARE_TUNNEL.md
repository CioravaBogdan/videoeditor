# Cloudflare Tunnel Configuration

## Setup Instructions

### 1. Install Cloudflared
```bash
# Windows (via Chocolatey)
choco install cloudflared

# Or download from: https://github.com/cloudflare/cloudflared/releases
```

### 2. Authenticate with Cloudflare
```bash
cloudflared tunnel login
```

### 3. Create and Configure Tunnel
```bash
# Create tunnel
cloudflared tunnel create videoeditor

# Configure tunnel
cloudflared tunnel route dns videoeditor videoeditor.byinfant.com
```

### 4. Create Tunnel Configuration File

Create `~/.cloudflared/config.yml`:
```yaml
tunnel: videoeditor
credentials-file: ~/.cloudflared/[TUNNEL-ID].json

ingress:
  - hostname: videoeditor.byinfant.com
    service: http://localhost:3030
  - service: http_status:404
```

### 5. Run Tunnel
```bash
# Run tunnel
cloudflared tunnel run videoeditor

# Or run as service
cloudflared service install
```

## API Endpoints via Cloudflare

Once tunnel is active, your API will be available at:

- **Base URL**: `https://videoeditor.byinfant.com`
- **Health Check**: `https://videoeditor.byinfant.com/health`
- **Upload**: `https://videoeditor.byinfant.com/upload`
- **Jobs**: `https://videoeditor.byinfant.com/jobs`
- **Download**: `https://videoeditor.byinfant.com/download/{filename}`
- **Metadata**: `https://videoeditor.byinfant.com/metadata/{filename}`

## n8n Integration

Update your n8n workflows to use:
```
https://videoeditor.byinfant.com/metadata/{{ $json.files[0].filename }}
```

## Local Testing

The service is still available locally on:
- **API**: http://localhost:3030
- **Redis**: localhost:3031

## Port Configuration

| Service | Local Port | Container Port | Purpose |
|---------|------------|----------------|---------|
| API | 3030 | 3001 | Main video rendering API |
| Redis | 3031 | 6379 | Queue management |

## Security Notes

- Cloudflare tunnel provides automatic SSL/TLS encryption
- No need to expose ports directly through firewall
- All traffic routed through Cloudflare's edge network
- Built-in DDoS protection and caching
