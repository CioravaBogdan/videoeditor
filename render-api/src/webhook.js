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
    ...data
  };

  try {
    const response = await axios.post(webhookUrl, payload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'VideoRenderQueue/1.0'
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
      statusText: error.response?.statusText,
      data: error.response?.data
    });

    // Don't throw error - webhook failure shouldn't fail the job
    return null;
  }
};

const sendJobStartedWebhook = async (jobId, jobData) => {
  return sendWebhook(jobId, 'started', {
    message: 'Video rendering started',
    startedAt: new Date().toISOString(),
    estimatedDuration: calculateEstimatedDuration(jobData)
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
    renderTime: result.renderTime
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

const sendJobProgressWebhook = async (jobId, progress) => {
  return sendWebhook(jobId, 'progress', {
    message: 'Video rendering in progress',
    progress,
    updatedAt: new Date().toISOString()
  });
};

// Calculate estimated duration based on job data
const calculateEstimatedDuration = (jobData) => {
  if (!jobData.clips || !Array.isArray(jobData.clips)) {
    return null;
  }

  // Estimate based on total video duration and processing type
  const totalDuration = jobData.clips.reduce((sum, clip) => sum + (clip.duration || 5), 0);
  const baseMultiplier = jobData.gpu ? 0.3 : 1.0; // GPU is ~3x faster
  const complexityMultiplier = jobData.fps > 30 ? 1.5 : 1.0;
  
  const estimatedSeconds = Math.ceil(totalDuration * baseMultiplier * complexityMultiplier);
  
  return {
    totalClipDuration: totalDuration,
    estimatedRenderTime: estimatedSeconds,
    estimatedRenderTimeFormatted: `${Math.floor(estimatedSeconds / 60)}m ${estimatedSeconds % 60}s`
  };
};

module.exports = {
  sendWebhook,
  sendJobStartedWebhook,
  sendJobCompletedWebhook,
  sendJobFailedWebhook,
  sendJobProgressWebhook
};
