const axios = require('axios');

const sendWebhook = async (jobId, status, data = {}) => {
  const webhookUrl = process.env.WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.log('No webhook URL configured, skipping notification');
    return;
  }

  const payload = {
    jobId,
    status,
    timestamp: new Date().toISOString(),
    workerId: process.env.WORKER_ID || 'unknown',
    useGpu: process.env.USE_GPU === 'true',
    ...data
  };

  try {
    const response = await axios.post(webhookUrl, payload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'VideoRenderWorker/1.0'
      }
    });

    console.log(`Webhook sent for job ${jobId}:`, {
      status: response.status,
      statusText: response.statusText
    });

    return response.data;

  } catch (error) {
    console.error(`Failed to send webhook for job ${jobId}:`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText
    });

    // Don't throw error - webhook failure shouldn't fail the job
    return null;
  }
};

const sendJobStartedWebhook = async (jobId, jobData) => {
  return sendWebhook(jobId, 'started', {
    message: 'Video rendering started',
    startedAt: new Date().toISOString(),
    clips: jobData.clips?.length || 0,
    resolution: `${jobData.width || 1080}x${jobData.height || 1920}`,
    fps: jobData.fps || 30,
    gpu: jobData.gpu || false
  });
};

const sendJobCompletedWebhook = async (jobId, result) => {
  const externalDomain = process.env.EXTERNAL_DOMAIN || 'http://localhost:3001';
  const downloadUrl = result.outputFile ? `${externalDomain}/download/${result.outputFile}` : null;

  return sendWebhook(jobId, 'completed', {
    message: 'Video rendering completed successfully',
    completedAt: new Date().toISOString(),
    outputFile: result.outputFile,
    downloadUrl,
    duration: result.duration,
    fileSize: result.fileSize,
    renderTime: result.renderTime,
    resolution: result.resolution,
    fps: result.fps,
    useGpu: result.useGpu
  });
};

const sendJobFailedWebhook = async (jobId, error, attempts) => {
  return sendWebhook(jobId, 'failed', {
    message: 'Video rendering failed',
    failedAt: new Date().toISOString(),
    error: error.message,
    attempts,
    retryable: attempts < 3
  });
};

module.exports = {
  sendWebhook,
  sendJobStartedWebhook,
  sendJobCompletedWebhook,
  sendJobFailedWebhook
};
