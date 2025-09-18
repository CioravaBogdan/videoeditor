# 🔄 PORT CONFIGURATION UPDATE

## Porturile au fost schimbate pentru a evita conflictele:

### ✅ **Porturi Noi (Video Render System)**
- **API Server**: `localhost:3030` (înainte: 3001)
- **Redis Queue**: `localhost:3031` (înainte: 6382)

### 📊 **Status Porturi:**
```
✅ 3030 - Video Render API (NOU)
✅ 3031 - Video Render Redis (NOU)
🔵 3001 - Editly API (rămas neschimbat)
🔵 6379 - Shopify Redis (rămas neschimbat)
```

## 🔗 **Endpoint-uri Actualizate:**

### Health Check
```
GET http://localhost:3030/health
```

### File Upload 
```
POST http://localhost:3030/upload
```

### Video Rendering
```
POST http://localhost:3030/jobs
```

### Job Status
```
GET http://localhost:3030/jobs/{jobId}
```

### Download Video
```
GET http://localhost:3030/download/{filename}
```

### Uploaded Files
```
GET http://localhost:3030/uploads/{filename}
```

## 🎯 **Pentru N8N:**

Actualizează URL-urile în n8n nodes:

### Upload Node:
```json
"url": "http://host.docker.internal:3030/upload"
```

### Render Job Node:
```json
"url": "http://host.docker.internal:3030/jobs"
```

### Status Check Node:
```json
"url": "http://host.docker.internal:3030/jobs/{{ $json.jobId }}"
```

### Download Node:
```json
"url": "http://host.docker.internal:3030/download/{{ $json.outputFilename }}"
```

## ✅ **Sistemele funcționează simultan:**
- **Editly (vechi)**: `localhost:3001` - ACTIV
- **Video Render (nou)**: `localhost:3030` - ACTIV

Acum poți folosi ambele sisteme în paralel fără conflicte de porturi!
