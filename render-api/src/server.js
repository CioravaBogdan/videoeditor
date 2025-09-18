const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const cron = require('node-cron');
require('dotenv').config();

const { createQueue, getJobStatus, addJob } = require('./queue');
const { sendWebhook } = require('./webhook');
const { cleanupOldFiles } = require('./cleanup');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories
const UPLOADS_DIR = '/uploads';
const OUTPUTS_DIR = '/outputs';
const TEMP_DIR = '/tmp';

// Ensure directories exist
[UPLOADS_DIR, OUTPUTS_DIR, TEMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// File upload configuration
const upload = multer({
  dest: UPLOADS_DIR,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Initialize queue
const renderQueue = createQueue('video-render');

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    queue: 'connected'
  });
});

// File upload endpoint (compatible with n8n)
app.post('/upload', upload.array('files'), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = req.files.map(file => {
      // Generate a unique filename based on the pattern from n8n example
      const timestamp = Date.now();
      const randomId = Math.floor(Math.random() * 1000000000);
      const ext = path.extname(file.originalname);
      const newFilename = `files-${timestamp}-${randomId}${ext}`;
      const newPath = path.join(UPLOADS_DIR, newFilename);
      
      // Move file to final location with new name
      fs.renameSync(file.path, newPath);
      
      return {
        originalName: file.originalname,
        filename: newFilename,
        path: newPath,
        size: file.size,
        url: `/uploads/${newFilename}`
      };
    });

    res.json({
      message: 'Files uploaded successfully',
      files: uploadedFiles
    });

    console.log(`Uploaded ${uploadedFiles.length} files:`, uploadedFiles.map(f => f.filename));
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload files',
      details: error.message 
    });
  }
});

// File metadata endpoint (compatible with n8n - replaces editly metadata)
app.get('/metadata/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    console.log(`[METADATA] Request for file: ${filename}`);
    
    // Check in uploads directory first, then outputs directory
    let filePath = path.join(UPLOADS_DIR, filename);
    let resolvedPath = path.resolve(filePath);
    let uploadsPath = path.resolve(UPLOADS_DIR);
    let outputsPath = path.resolve(OUTPUTS_DIR);
    
    console.log(`[METADATA] Checking uploads path: ${filePath}`);
    
    // Check if file exists in uploads
    if (!fs.existsSync(filePath)) {
      // Try outputs directory
      filePath = path.join(OUTPUTS_DIR, filename);
      resolvedPath = path.resolve(filePath);
      
      console.log(`[METADATA] File not in uploads, checking outputs path: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`[METADATA] File not found in either location`);
        return res.status(404).json({
          error: 'File not found in uploads or outputs'
        });
      }
      
      console.log(`[METADATA] File found in outputs`);
      
      // Security check for outputs directory
      if (!resolvedPath.startsWith(outputsPath)) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }
    } else {
      console.log(`[METADATA] File found in uploads`);
      // Security check for uploads directory
      if (!resolvedPath.startsWith(uploadsPath)) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }
    }

    // Get basic file stats
    const stats = fs.statSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    
    // Determine file type
    let fileType = 'unknown';
    if (['.mp3', '.wav', '.aac', '.ogg', '.m4a', '.flac'].includes(ext)) {
      fileType = 'audio';
    } else if (['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv'].includes(ext)) {
      fileType = 'video';
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
      fileType = 'image';
    }

    // Basic metadata response
    let metadata = {
      filename: filename,
      path: filePath,
      url: `/uploads/${filename}`,
      size: stats.size,
      type: fileType,
      extension: ext,
      created: stats.birthtime,
      modified: stats.mtime
    };

    // For media files, try to get additional metadata using FFprobe
    if (fileType === 'audio' || fileType === 'video') {
      try {
        const { spawn } = require('child_process');
        
        const ffprobeProcess = spawn('ffprobe', [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          filePath
        ]);

        let ffprobeOutput = '';
        ffprobeProcess.stdout.on('data', (data) => {
          ffprobeOutput += data.toString();
        });

        await new Promise((resolve, reject) => {
          ffprobeProcess.on('close', (code) => {
            if (code === 0) {
              try {
                const ffprobeData = JSON.parse(ffprobeOutput);
                
                // Extract useful metadata
                if (ffprobeData.format) {
                  metadata.duration = parseFloat(ffprobeData.format.duration) || 0;
                  metadata.bitrate = parseInt(ffprobeData.format.bit_rate) || 0;
                  metadata.format = ffprobeData.format.format_name;
                }

                if (ffprobeData.streams && ffprobeData.streams.length > 0) {
                  const videoStream = ffprobeData.streams.find(s => s.codec_type === 'video');
                  const audioStream = ffprobeData.streams.find(s => s.codec_type === 'audio');

                  if (videoStream) {
                    metadata.video = {
                      codec: videoStream.codec_name,
                      width: videoStream.width,
                      height: videoStream.height,
                      fps: eval(videoStream.r_frame_rate) || 0,
                      duration: parseFloat(videoStream.duration) || 0
                    };
                  }

                  if (audioStream) {
                    metadata.audio = {
                      codec: audioStream.codec_name,
                      sample_rate: parseInt(audioStream.sample_rate) || 0,
                      channels: audioStream.channels,
                      duration: parseFloat(audioStream.duration) || 0
                    };
                  }
                }
                
                resolve();
              } catch (parseError) {
                console.warn('FFprobe parse error:', parseError);
                resolve(); // Continue with basic metadata
              }
            } else {
              console.warn('FFprobe failed with code:', code);
              resolve(); // Continue with basic metadata
            }
          });
        });

      } catch (ffprobeError) {
        console.warn('FFprobe error:', ffprobeError);
        // Continue with basic metadata
      }
    }

    res.json(metadata);

  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({
      error: 'Failed to get file metadata',
      details: error.message
    });
  }
});

// Create new render job
app.post('/jobs', async (req, res) => {
  try {
    const jobId = uuidv4();
    const jobData = {
      id: jobId,
      ...req.body,
      createdAt: new Date().toISOString(),
      status: 'queued'
    };

    // Handle both simple format and complex Editly format
    let processedJobData = jobData;
    
    // Check if this is the complex Editly format (with editSpec)
    if (jobData.editSpec) {
      processedJobData = {
        ...jobData.editSpec,
        outputFilename: jobData.outputFilename,
        stats: jobData.stats,
        // Convert complex Editly format to our internal format
        isEditlyFormat: true
      };
    }

    // Validate required fields - support both formats
    const clips = processedJobData.clips || processedJobData.editSpec?.clips;
    if (!clips || !Array.isArray(clips) || clips.length === 0) {
      return res.status(400).json({
        error: 'Invalid input: clips array is required'
      });
    }

    // Update job data with processed format
    const finalJobData = {
      id: jobId,
      ...processedJobData,
      createdAt: new Date().toISOString(),
      status: 'queued'
    };

    // Add job to queue
    await addJob(renderQueue, finalJobData);

    res.json({
      jobId,
      status: 'queued',
      message: 'Job created successfully'
    });

  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({
      error: 'Failed to create job',
      details: error.message
    });
  }
});

// Get all jobs or job status by id 
app.get('/jobs/:id?', async (req, res) => {
  try {
    const { id } = req.params;
    
    // If no ID provided, return last jobs for n8n compatibility
    if (!id) {
      console.log(`[DEBUG] GET /jobs/ (no ID) - Headers:`, JSON.stringify(req.headers, null, 2));
      console.log(`[DEBUG] Full URL: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
      console.log(`[DEBUG] User-Agent: ${req.get('User-Agent')}`);
      
      // Get recent jobs from Redis
      try {
        const jobs = await renderQueue.getJobs(['completed', 'active', 'waiting', 'failed'], 0, 10);
        const jobList = jobs.map(job => ({
          id: job.id,
          status: job.finishedOn ? 'completed' : job.failedReason ? 'failed' : 'active',
          progress: job.progress,
          data: job.data,
          createdAt: new Date(job.timestamp).toISOString(),
          processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
          finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          failedReason: job.failedReason || null
        }));
        
        console.log(`[DEBUG] Returning ${jobList.length} jobs for /jobs/ request`);
        return res.json(jobList);
      } catch (error) {
        console.error('[ERROR] Failed to get jobs list:', error);
        return res.status(500).json({
          error: 'Failed to retrieve jobs',
          message: error.message
        });
      }
    }
    
    // Get specific job by ID
    console.log(`[DEBUG] GET /jobs/${id} - Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`[DEBUG] Full URL: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
    console.log(`[DEBUG] User-Agent: ${req.get('User-Agent')}`);
    
    const status = await getJobStatus(renderQueue, id);

    if (!status) {
      return res.status(404).json({
        error: 'Job not found'
      });
    }

    res.json(status);

  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      details: error.message
    });
  }
});

// Download rendered video
app.get('/download/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(OUTPUTS_DIR, filename);

    // Security check - ensure file is in outputs directory
    const resolvedPath = path.resolve(filePath);
    const outputsPath = path.resolve(OUTPUTS_DIR);
    
    if (!resolvedPath.startsWith(outputsPath)) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      error: 'Failed to download file',
      details: error.message
    });
  }
});

// Serve uploaded files (for n8n compatibility)
app.get('/uploads/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(UPLOADS_DIR, filename);

    // Security check - ensure file is in uploads directory
    const resolvedPath = path.resolve(filePath);
    const uploadsPath = path.resolve(UPLOADS_DIR);
    
    if (!resolvedPath.startsWith(uploadsPath)) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.mp3' || ext === '.wav' || ext === '.ogg') {
      contentType = `audio/${ext.substring(1)}`;
    } else if (ext === '.mp4' || ext === '.avi' || ext === '.mov') {
      contentType = `video/${ext.substring(1)}`;
    } else if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.gif') {
      contentType = `image/${ext.substring(1)}`;
    }

    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

    // Stream file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Error serving uploaded file:', error);
    res.status(500).json({
      error: 'Failed to serve file',
      details: error.message
    });
  }
});

// Manual cleanup
app.post('/cleanup', async (req, res) => {
  try {
    const result = await cleanupOldFiles(UPLOADS_DIR, OUTPUTS_DIR, TEMP_DIR);
    res.json({
      message: 'Cleanup completed',
      ...result
    });

  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({
      error: 'Cleanup failed',
      details: error.message
    });
  }
});

// Disk usage info
app.get('/disk-usage', async (req, res) => {
  try {
    const getDirSize = (dirPath) => {
      if (!fs.existsSync(dirPath)) return 0;
      let size = 0;
      const files = fs.readdirSync(dirPath);
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          size += getDirSize(filePath);
        } else {
          size += stats.size;
        }
      });
      return size;
    };

    const uploadsSize = getDirSize(UPLOADS_DIR);
    const outputsSize = getDirSize(OUTPUTS_DIR);
    const tempSize = getDirSize(TEMP_DIR);
    const totalSize = uploadsSize + outputsSize + tempSize;

    res.json({
      uploads: { bytes: uploadsSize, mb: Math.round(uploadsSize / 1024 / 1024 * 100) / 100 },
      outputs: { bytes: outputsSize, mb: Math.round(outputsSize / 1024 / 1024 * 100) / 100 },
      temp: { bytes: tempSize, mb: Math.round(tempSize / 1024 / 1024 * 100) / 100 },
      total: { bytes: totalSize, mb: Math.round(totalSize / 1024 / 1024 * 100) / 100 }
    });

  } catch (error) {
    console.error('Error getting disk usage:', error);
    res.status(500).json({
      error: 'Failed to get disk usage',
      details: error.message
    });
  }
});

// Queue management endpoints
app.get('/queue/stats', async (req, res) => {
  try {
    const waiting = await renderQueue.waiting();
    const active = await renderQueue.active();
    const completed = await renderQueue.completed();
    const failed = await renderQueue.failed();

    res.json({
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    });

  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({
      error: 'Failed to get queue stats',
      details: error.message
    });
  }
});

// Auto-cleanup job (runs every hour)
if (process.env.AUTO_CLEANUP_ENABLED === 'true') {
  const cleanupHours = parseInt(process.env.CLEANUP_AFTER_HOURS) || 2;
  cron.schedule('0 * * * *', async () => {
    console.log('Running scheduled cleanup...');
    try {
      await cleanupOldFiles(UPLOADS_DIR, OUTPUTS_DIR, TEMP_DIR, cleanupHours);
      console.log('Scheduled cleanup completed');
    } catch (error) {
      console.error('Scheduled cleanup failed:', error);
    }
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.log(`[ERROR] 404 - Method: ${req.method}, URL: ${req.originalUrl}, Headers:`, JSON.stringify(req.headers, null, 2));
  console.log(`[ERROR] User-Agent: ${req.get('User-Agent')}`);
  res.status(404).json({
    error: 'Endpoint not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Render API server running on port ${PORT}`);
  console.log(`External domain: ${process.env.EXTERNAL_DOMAIN || 'http://localhost:' + PORT}`);
});

module.exports = app;
