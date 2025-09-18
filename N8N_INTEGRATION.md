# N8N Integration Guide

## File Upload Endpoint

Your new video rendering system has an `/upload` endpoint that is **100% compatible** with your existing n8n workflow.

### Endpoint Details

**🐳 Pentru n8n în Docker (RECOMANDAT):**
```
POST http://host.docker.internal:3030/upload
Content-Type: multipart/form-data
```

**🌐 Pentru n8n local (alternativă):**
```
POST http://127.0.0.1:3030/upload
POST http://192.168.1.30:3030/upload
Content-Type: multipart/form-data
```

**⚠️ TROUBLESHOOTING:** Dacă primești `ECONNREFUSED ::1:3030`, folosește `host.docker.internal` în loc de `localhost`.

### Request Format
- **Field name**: `files` (array)
- **Content-Type**: `multipart/form-data`
- **File size limit**: 100MB per file

### Response Format
```json
{
  "message": "Files uploaded successfully",
  "files": [
    {
      "originalName": "audio.textToSpeech.mp3",
      "filename": "files-1757001703497-812942446.mp3",
      "path": "/app/uploads/files-1757001703497-812942446.mp3",
      "size": 206516,
      "url": "/uploads/files-1757001703497-812942446.mp3"
    }
  ]
}
```

## Using Uploaded Files in Video Rendering

### Option 1: Local File Paths (Recommended)
Use the returned file paths directly in your video rendering jobs:

```json
{
  "outputFilename": "my_video.mp4",
  "clips": [
    {
      "path": "/app/uploads/files-1757001703497-812942446.mp3",
      "duration": 5
    }
  ]
}
```

### Option 2: URLs
Use the returned URLs if serving files externally:

```json
{
  "outputFilename": "my_video.mp4", 
  "editSpec": {
    "clips": [
      {
        "duration": 4,
        "layers": [
          {
            "type": "image",
            "path": "https://example.com/image.jpg"
          },
          {
            "type": "audio",
            "path": "http://localhost:3030/uploads/files-1757001703497-812942446.mp3"
          }
        ]
      }
    ]
  }
}
```

## N8N Workflow Integration

### 1. Keep Your Existing Upload Node
Your current n8n node configuration works perfectly:

```json
{
  "parameters": {
    "method": "POST",
    "url": "http://host.docker.internal:3030/upload",
    "sendBody": true,
    "contentType": "multipart-form-data",
    "bodyParameters": {
      "parameters": [
        {
          "parameterType": "formBinaryData",
          "name": "files",
          "inputDataFieldName": "data"
        }
      ]
    }
  }
}
```

### 2. Update Video Rendering Node
Replace your Editly rendering node with:

```json
{
  "parameters": {
    "method": "POST",
    "url": "http://host.docker.internal:3030/jobs",
    "sendBody": true,
    "contentType": "application/json",
    "bodyParameters": {
      "parameters": [
        {
          "name": "outputFilename",
          "value": "={{ $json.outputFilename }}"
        },
        {
          "name": "editSpec",
          "value": "={{ $json.editSpec }}"
        }
      ]
    }
  }
}
```

### 3. Check Job Status
Monitor rendering progress:

```json
{
  "parameters": {
    "method": "GET", 
    "url": "http://host.docker.internal:3030/jobs/{{ $json.jobId }}",
    "options": {}
  }
}
```

### 4. Download Completed Video
Get the rendered video:

```json
{
  "parameters": {
    "method": "GET",
    "url": "http://host.docker.internal:3030/download/{{ $json.outputFilename }}",
    "options": {
      "response": {
        "response": {
          "neverError": true,
          "responseFormat": "file"
        }
      }
    }
  }
}
```

## File Storage Strategy

### Recommended Approach
1. **Upload audio files** → Get file paths
2. **Store file paths** in your database/workflow
3. **Use local file paths** in video rendering jobs (better performance)
4. **Clean up files** after video rendering completes

### Database Storage Example
```sql
CREATE TABLE video_assets (
  id UUID PRIMARY KEY,
  original_name VARCHAR(255),
  file_path VARCHAR(500),
  file_url VARCHAR(500),
  file_size INTEGER,
  created_at TIMESTAMP,
  used_in_videos TEXT[] -- Array of video job IDs
);
```

## Performance Benefits

### Local File Access (Recommended)
- ✅ **Faster processing** (no network downloads)
- ✅ **More reliable** (no external dependencies)
- ✅ **Better error handling**
- ✅ **Lower bandwidth usage**

### URL-based Access
- ⚠️ **Slower processing** (needs to download each file)
- ⚠️ **Network dependent** (can fail if URLs unreachable)
- ✅ **Easier for external assets**

## Migration Notes

1. **No changes needed** to your n8n upload node
2. **Update only** your video rendering endpoints
3. **Same file structure** and naming convention maintained
4. **Auto-cleanup** removes old files after 2 hours (configurable)

The system maintains **100% backward compatibility** with your existing file upload workflow while providing a much more scalable video rendering backend.
