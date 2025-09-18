const Queue = require('bull');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { processVideo } = require('./ffmpeg');
const { sendJobStartedWebhook, sendJobCompletedWebhook, sendJobFailedWebhook } = require('./webhook');
const { cleanupOldFiles } = require('./cleanup');

// Worker configuration
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY) || 1;
const USE_GPU = process.env.USE_GPU === 'true';
const WORKER_ID = process.env.WORKER_ID || `worker-${USE_GPU ? 'gpu' : 'cpu'}-${Math.random().toString(36).substr(2, 9)}`;

// Redis connection
const redisConfig = {
  redis: {
    port: process.env.REDIS_PORT || 6379,
    host: process.env.REDIS_HOST || 'localhost',
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0
  }
};

// Create queue connection
const renderQueue = new Queue('video-render', redisConfig);

console.log(`Starting video worker: ${WORKER_ID}`);
console.log(`GPU enabled: ${USE_GPU}`);
console.log(`Concurrency: ${CONCURRENCY}`);

// Process jobs
renderQueue.process('render-video', CONCURRENCY, async (job) => {
  const { id, data } = job;
  
  console.log(`Processing job ${id} with data:`, {
    clips: data.clips?.length,
    gpu: data.gpu,
    width: data.width,
    height: data.height,
    fps: data.fps
  });

  try {
    // Update job progress
    await job.progress(10);
    
    // Send started webhook
    await sendJobStartedWebhook(id, data);
    
    // Check if this worker can handle GPU jobs
    if (data.gpu === true && !USE_GPU) {
      throw new Error('This worker does not support GPU processing');
    }
    
    // Process the video
    await job.progress(20);
    const result = await processVideo(data, (progress) => {
      job.progress(20 + Math.floor(progress * 0.7)); // Progress from 20% to 90%
    });
    
    await job.progress(95);
    
    // Send completion webhook
    await sendJobCompletedWebhook(id, result);
    
    await job.progress(100);
    
    console.log(`Job ${id} completed successfully:`, {
      outputFile: result.outputFile,
      duration: result.duration,
      renderTime: result.renderTime
    });
    
    return result;
    
  } catch (error) {
    console.error(`Job ${id} failed:`, error.message);
    
    // Send failure webhook
    await sendJobFailedWebhook(id, error, job.attemptsMade);
    
    throw error;
  }
});

// Queue event handlers
renderQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed in ${Date.now() - job.timestamp}ms`);
});

renderQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed after ${job.attemptsMade} attempts:`, err.message);
});

renderQueue.on('stalled', (job) => {
  console.warn(`⚠️ Job ${job.id} stalled`);
});

renderQueue.on('progress', (job, progress) => {
  console.log(`📊 Job ${job.id} progress: ${progress}%`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await renderQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await renderQueue.close();
  process.exit(0);
});

// Auto-cleanup (runs every 2 hours)
if (process.env.AUTO_CLEANUP_ENABLED === 'true') {
  const cron = require('node-cron');
  const cleanupHours = parseInt(process.env.CLEANUP_AFTER_HOURS) || 2;
  
  cron.schedule('0 */2 * * *', async () => {
    console.log('Running worker cleanup...');
    try {
      await cleanupOldFiles('/uploads', '/outputs', '/tmp', cleanupHours);
      console.log('Worker cleanup completed');
    } catch (error) {
      console.error('Worker cleanup failed:', error);
    }
  });
}

console.log(`Worker ${WORKER_ID} is ready and waiting for jobs...`);
