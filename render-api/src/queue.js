const Queue = require('bull');
const Redis = require('redis');

// Redis connection
const redisConfig = {
  redis: {
    port: process.env.REDIS_PORT || 6379,
    host: process.env.REDIS_HOST || 'localhost',
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0
  }
};

// Create queue
const createQueue = (name) => {
  const queue = new Queue(name, redisConfig);

  // Queue event handlers
  queue.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed:`, result);
  });

  queue.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message);
  });

  queue.on('stalled', (job) => {
    console.warn(`Job ${job.id} stalled`);
  });

  return queue;
};

// Add job to queue
const addJob = async (queue, jobData) => {
  const options = {
    delay: 0,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 50, // Keep last 50 completed jobs
    removeOnFail: 20,     // Keep last 20 failed jobs
    jobId: jobData.id     // Use our UUID as the job ID
  };

  // Priority based on GPU requirement
  if (jobData.gpu === true) {
    options.priority = 10; // Higher priority for GPU jobs
  } else {
    options.priority = 5;  // Normal priority for CPU jobs
  }

  const job = await queue.add('render-video', jobData, options);
  console.log(`Job ${job.id} added to queue with priority ${options.priority}`);
  
  return job;
};

// Get job status
const getJobStatus = async (queue, jobId) => {
  try {
    const job = await queue.getJob(jobId);
    
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress();
    
    return {
      id: job.id,
      status: state,
      progress: progress,
      data: job.data,
      createdAt: new Date(job.timestamp).toISOString(),
      processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      failedReason: job.failedReason || null,
      returnValue: job.returnvalue || null
    };

  } catch (error) {
    console.error('Error getting job status:', error);
    throw error;
  }
};

// Get queue statistics
const getQueueStats = async (queue) => {
  try {
    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    };

  } catch (error) {
    console.error('Error getting queue stats:', error);
    throw error;
  }
};

// Clean old jobs
const cleanOldJobs = async (queue, maxAge = 24) => {
  try {
    const maxAgeMs = maxAge * 60 * 60 * 1000; // Convert hours to milliseconds
    const cutoff = Date.now() - maxAgeMs;

    // Clean completed jobs older than maxAge
    await queue.clean(cutoff, 'completed');
    
    // Clean failed jobs older than maxAge
    await queue.clean(cutoff, 'failed');

    console.log(`Cleaned jobs older than ${maxAge} hours`);

  } catch (error) {
    console.error('Error cleaning old jobs:', error);
    throw error;
  }
};

module.exports = {
  createQueue,
  addJob,
  getJobStatus,
  getQueueStats,
  cleanOldJobs
};
