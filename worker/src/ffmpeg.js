const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const USE_GPU = process.env.USE_GPU === 'true';
const OUTPUTS_DIR = '/outputs';
const TEMP_DIR = '/tmp';

const processVideo = async (jobData, progressCallback) => {
  const startTime = Date.now();
  const tempId = uuidv4();
  const outputFilename = jobData.outputFilename || `video_${tempId}.mp4`;
  const outputPath = path.join(OUTPUTS_DIR, outputFilename);
  
  try {
    // Validate input data - support both simple and complex Editly formats
    const clips = jobData.clips;
    if (!clips || !Array.isArray(clips) || clips.length === 0) {
      throw new Error('No clips provided');
    }

    // Set default values
    const width = jobData.width || 1080;
    const height = jobData.height || 1920;
    const fps = jobData.fps || 30;
    const isEditlyFormat = jobData.isEditlyFormat || false;

    console.log(`Processing video: ${outputFilename}`);
    console.log(`Resolution: ${width}x${height}, FPS: ${fps}`);
    console.log(`Clips: ${clips.length}`);
    console.log(`Format: ${isEditlyFormat ? 'Editly Complex' : 'Simple'}`);
    console.log(`GPU: ${USE_GPU}`);

    if (progressCallback) progressCallback(5);

    let result;
    
    if (isEditlyFormat) {
      // Handle complex Editly format with layers
      result = await processEditlyFormat(jobData, tempId, progressCallback);
    } else {
      // Handle simple format
      result = await processSimpleFormat(jobData, tempId, progressCallback);
    }

    if (progressCallback) progressCallback(95);
    
    // Get file stats
    const stats = fs.statSync(outputPath);
    const fileSize = stats.size;
    
    // Calculate video duration
    const duration = await getVideoDuration(outputPath);
    
    const renderTime = Date.now() - startTime;
    
    console.log(`Video processing completed: ${outputFilename}`);
    console.log(`File size: ${formatBytes(fileSize)}`);
    console.log(`Duration: ${duration}s`);
    console.log(`Render time: ${renderTime}ms`);

    return {
      outputFile: outputFilename,
      outputPath,
      fileSize,
      duration,
      renderTime,
      resolution: `${width}x${height}`,
      fps,
      useGpu: USE_GPU,
      format: isEditlyFormat ? 'editly' : 'simple'
    };

  } catch (error) {
    console.error('Video processing failed:', error);
    
    // Cleanup on error
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    
    throw error;
  }
};

const createConcatFile = async (clips, tempId) => {
  const concatPath = path.join(TEMP_DIR, `concat_${tempId}.txt`);
  let concatContent = '';

  for (const clip of clips) {
    const imagePath = clip.imagePath || clip.path;
    const duration = clip.duration || 5;

    if (!imagePath) {
      throw new Error('Clip missing image path');
    }

    // Build full path to uploaded file
    const fullImagePath = path.join('/uploads', imagePath);
    
    if (!fs.existsSync(fullImagePath)) {
      throw new Error(`Image file not found: ${fullImagePath}`);
    }

    // Add image to concat file
    concatContent += `file '${fullImagePath}'\n`;
    concatContent += `duration ${duration}\n`;
  }

  // Add the last image again for proper concat behavior
  if (clips.length > 0) {
    const lastClip = clips[clips.length - 1];
    const lastImagePath = lastClip.imagePath || lastClip.path;
    const fullLastImagePath = path.join('/uploads', lastImagePath);
    concatContent += `file '${fullLastImagePath}'\n`;
  }

  fs.writeFileSync(concatPath, concatContent);
  console.log(`Created concat file: ${concatPath}`);
  
  return concatPath;
};

const buildFFmpegCommand = ({ concatFile, audioPath, outputPath, width, height, fps, useGpu }) => {
  const args = [
    // Input settings
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile
  ];

  // Add audio input if provided
  if (audioPath) {
    const fullAudioPath = path.join('/uploads', audioPath);
    if (fs.existsSync(fullAudioPath)) {
      args.push('-i', fullAudioPath);
    }
  }

  // Video encoding settings
  if (useGpu) {
    // GPU encoding with NVENC
    args.push(
      '-c:v', 'h264_nvenc',
      '-preset', 'p5',          // Performance preset (p1=fast, p7=slow)
      '-cq', '23',             // Constant quality (lower = better quality)
      '-b:v', '5M',            // Target bitrate
      '-maxrate', '8M',        // Maximum bitrate
      '-bufsize', '10M',       // Buffer size
      '-profile:v', 'main',    // H.264 profile
      '-level', '4.1',         // H.264 level
      '-rc', 'vbr',           // Rate control mode
      '-surfaces', '64',       // Encoding surfaces
      '-bf', '3',             // B-frames
      '-g', String(fps * 2)    // GOP size (2 seconds)
    );
  } else {
    // CPU encoding with x264
    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',   // Encoding speed
      '-crf', '23',           // Constant rate factor
      '-profile:v', 'main',   // H.264 profile
      '-level', '4.1',        // H.264 level
      '-bf', '3',            // B-frames
      '-g', String(fps * 2)   // GOP size (2 seconds)
    );
  }

  // Audio encoding
  if (audioPath && fs.existsSync(audioPath)) {
    args.push(
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-shortest'  // End when shortest stream ends
    );
  } else {
    args.push('-an'); // No audio
  }

  // Output settings
  args.push(
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    '-r', String(fps),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',  // Optimize for streaming
    '-y',                       // Overwrite output file
    outputPath
  );

  return args;
};

// Build FFmpeg command for video concatenation
const buildVideoFFmpegCommand = async ({ clips, audioPath, outputPath, width, height, fps, useGpu }) => {
  const args = [];

  // Add input videos
  for (const clip of clips) {
    const videoPath = clip.path || clip.imagePath;
    const fullVideoPath = path.join('/uploads', videoPath);
    
    if (!fs.existsSync(fullVideoPath)) {
      throw new Error(`Video file not found: ${fullVideoPath}`);
    }
    
    args.push('-i', fullVideoPath);
  }

  // Add audio input if provided
  if (audioPath) {
    const fullAudioPath = path.join('/uploads', audioPath);
    if (fs.existsSync(fullAudioPath)) {
      args.push('-i', fullAudioPath);
    }
  }

  // Build filter complex for video concatenation and scaling
  let filterComplex = '';
  
  // Scale and pad each input video
  for (let i = 0; i < clips.length; i++) {
    const duration = clips[i].duration || 5;
    filterComplex += `[${i}:v]trim=0:${duration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[v${i}];`;
  }
  
  // Concatenate all scaled videos
  filterComplex += clips.map((_, i) => `[v${i}]`).join('') + `concat=n=${clips.length}:v=1:a=0[outv]`;

  args.push('-filter_complex', filterComplex, '-map', '[outv]');

  // Add audio mapping if audio is provided
  if (audioPath) {
    const fullAudioPath = path.join('/uploads', audioPath);
    if (fs.existsSync(fullAudioPath)) {
      args.push('-map', `${clips.length}:a`);
    }
  }

  // Video encoding settings
  if (useGpu) {
    // GPU encoding with NVENC
    args.push(
      '-c:v', 'h264_nvenc',
      '-preset', 'p5',          // Performance preset
      '-cq', '23',             // Constant quality
      '-b:v', '5M',            // Target bitrate
      '-maxrate', '8M',        // Maximum bitrate
      '-bufsize', '10M',       // Buffer size
      '-profile:v', 'main',    // H.264 profile
      '-level', '4.1',         // H.264 level
      '-rc', 'vbr',           // Rate control mode
      '-bf', '3',             // B-frames
      '-g', String(fps * 2)    // GOP size
    );
  } else {
    // CPU encoding with x264
    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',   // Encoding speed
      '-crf', '23',           // Constant rate factor
      '-profile:v', 'main',   // H.264 profile
      '-level', '4.1',        // H.264 level
      '-bf', '3',            // B-frames
      '-g', String(fps * 2)   // GOP size
    );
  }

  // Audio encoding
  if (audioPath) {
    const fullAudioPath = path.join('/uploads', audioPath);
    if (fs.existsSync(fullAudioPath)) {
      args.push(
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-shortest'
      );
    } else {
      args.push('-an'); // No audio
    }
  } else {
    args.push('-an'); // No audio
  }

  // Output settings
  args.push(
    '-r', String(fps),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',  // Optimize for streaming
    '-y',                       // Overwrite output file
    outputPath
  );

  return args;
};

const executeFFmpeg = (args, progressCallback) => {
  return new Promise((resolve, reject) => {
    console.log('Executing FFmpeg:', 'ffmpeg', args.join(' '));
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';
    let duration = 0;
    let lastProgress = 0;

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
      
      // Parse progress from FFmpeg output
      const durationMatch = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      if (durationMatch && duration === 0) {
        const [, hours, minutes, seconds] = durationMatch;
        duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
      }

      const timeMatch = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch && duration > 0) {
        const [, hours, minutes, seconds] = timeMatch;
        const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
        const progress = Math.min(100, Math.floor((currentTime / duration) * 100));
        
        if (progress > lastProgress && progressCallback) {
          lastProgress = progress;
          progressCallback(progress);
        }
      }
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('FFmpeg process completed successfully');
        resolve();
      } else {
        console.error('FFmpeg process failed with code:', code);
        console.error('FFmpeg stderr:', stderr);
        reject(new Error(`FFmpeg failed with exit code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on('error', (error) => {
      console.error('FFmpeg process error:', error);
      reject(error);
    });
  });
};

const getVideoDuration = async (videoPath) => {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      videoPath
    ]);

    let output = '';
    
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(duration || 0);
      } else {
        resolve(0); // Default to 0 if can't get duration
      }
    });

    ffprobe.on('error', () => {
      resolve(0); // Default to 0 on error
    });
  });
};

const cleanupTempFiles = (concatFile) => {
  try {
    if (fs.existsSync(concatFile)) {
      fs.unlinkSync(concatFile);
      console.log(`Cleaned up temp file: ${concatFile}`);
    }
  } catch (error) {
    console.error(`Failed to cleanup temp file ${concatFile}:`, error);
  }
};

const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

module.exports = {
  processVideo
};

// Process simple format (original implementation)
const processSimpleFormat = async (jobData, tempId, progressCallback) => {
  const outputPath = path.join(OUTPUTS_DIR, jobData.outputFilename || `video_${tempId}.mp4`);
  
  // Check if clips contain video files or images
  const hasVideoClips = jobData.clips.some(clip => {
    const path = clip.path || clip.imagePath;
    return path && (path.includes('.mp4') || path.includes('.avi') || path.includes('.mov') || path.includes('.mkv'));
  });

  if (progressCallback) progressCallback(10);

  let ffmpegArgs;
  
  if (hasVideoClips) {
    // Handle video concatenation
    ffmpegArgs = await buildVideoFFmpegCommand({
      clips: jobData.clips,
      audioPath: jobData.audioFilePath,
      outputPath,
      width: jobData.width || 1080,
      height: jobData.height || 1920,
      fps: jobData.fps || 30,
      useGpu: USE_GPU
    });
  } else {
    // Handle image sequence (original behavior)
    console.log('Creating concat file for clips:', jobData.clips.map(c => c.path || c.imagePath));
    const concatFile = await createConcatFile(jobData.clips, tempId);
    console.log('Concat file created at:', concatFile);
    
    ffmpegArgs = buildFFmpegCommand({
      concatFile,
      audioPath: jobData.audioFilePath || jobData.audioPath,
      outputPath,
      width: jobData.width || 1080,
      height: jobData.height || 1920,
      fps: jobData.fps || 30,
      useGpu: USE_GPU
    });
    
    console.log('FFmpeg args built:', ffmpegArgs);
  }

  if (progressCallback) progressCallback(15);

  // Execute FFmpeg
  await executeFFmpeg(ffmpegArgs, progressCallback);
  
  // Cleanup temp files if needed
  if (!hasVideoClips) {
    const concatFile = path.join(TEMP_DIR, `concat_${tempId}.txt`);
    cleanupTempFiles(concatFile);
  }
  
  return outputPath;
};

// Process complex Editly format with layers
const processEditlyFormat = async (jobData, tempId, progressCallback) => {
  const outputPath = path.join(OUTPUTS_DIR, jobData.outputFilename || `video_${tempId}.mp4`);
  const width = jobData.width || 1024;
  const height = jobData.height || 1536;
  const fps = jobData.fps || 30;
  
  // Extract video and audio layers from clips
  const videoSegments = [];
  const audioSegments = [];
  let totalDuration = 0;
  
  for (let i = 0; i < jobData.clips.length; i++) {
    const clip = jobData.clips[i];
    const clipDuration = clip.duration;
    
    // Find image and audio layers
    // Accept both 'image' and 'image-overlay' as valid visual bases
    const imageLayers = clip.layers.filter(layer => layer && (layer.type === 'image' || layer.type === 'image-overlay'));
    // Accept common audio layer naming variants
    const audioLayers = clip.layers.filter(layer => layer && (layer.type === 'audio' || layer.type === 'audioTrack'));
    
    if (imageLayers.length > 0) {
      const imageLayer = imageLayers[0]; // Take first image layer
      videoSegments.push({
        path: imageLayer.path,
        duration: clipDuration,
        start: totalDuration,
        resizeMode: imageLayer.resizeMode || 'cover'
      });
    }
    
    if (audioLayers.length > 0) {
      const audioLayer = audioLayers[0]; // Take first audio layer
      audioSegments.push({
        path: audioLayer.path,
        start: totalDuration,
        duration: clipDuration,
        volume: audioLayer.mixVolume || 1
      });
    }
    
    totalDuration += clipDuration;
  }
  
  if (progressCallback) progressCallback(20);
  
  // Create video concat file
  const videoConcatFile = await createEditlyVideoConcat(videoSegments, tempId);
  
  if (progressCallback) progressCallback(30);
  
  // Create audio filter complex for mixing multiple audio files
  const audioFilterComplex = buildEditlyAudioFilter(audioSegments);
  
  if (progressCallback) progressCallback(40);
  
  // Build complex FFmpeg command for Editly format
  const ffmpegArgs = buildEditlyFFmpegCommand({
    videoConcatFile,
    audioSegments,
    audioFilterComplex,
    outputPath,
    width,
    height,
    fps,
    useGpu: USE_GPU,
    customOutputArgs: jobData.customOutputArgs,
    audioCodec: jobData.audioCodec || 'aac',
    audioBitrate: jobData.audioBitrate || '128k',
    videoCodec: jobData.videoCodec || (USE_GPU ? 'h264_nvenc' : 'libx264'),
    videoBitrate: jobData.videoBitrate || '3000k'
  });
  
  if (progressCallback) progressCallback(50);
  
  // Execute FFmpeg
  await executeFFmpeg(ffmpegArgs, progressCallback);
  
  // Cleanup temp files
  cleanupTempFiles(videoConcatFile);
  
  return outputPath;
};

const createEditlyVideoConcat = async (videoSegments, tempId) => {
  const concatPath = path.join(TEMP_DIR, `editly_video_${tempId}.txt`);
  let concatContent = '';

  for (const segment of videoSegments) {
    // Handle both absolute paths from production (/uploads/...) and relative paths
    let fullPath;
    if (segment.path.startsWith('/uploads/')) {
      // Production path - map /uploads to container volume mount
      fullPath = segment.path;
    } else if (segment.path.startsWith('uploads/')) {
      // Relative path with uploads prefix
      fullPath = path.join('/', segment.path);
    } else {
      // Simple filename - add uploads prefix
      fullPath = path.join('/uploads', segment.path);
    }
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Image file not found: ${fullPath}`);
    }

    // Add image to concat file with duration
    concatContent += `file '${fullPath}'\n`;
    concatContent += `duration ${segment.duration}\n`;
  }

  // Add the last image again for proper concat behavior
  if (videoSegments.length > 0) {
    const lastSegment = videoSegments[videoSegments.length - 1];
    let lastPath;
    if (lastSegment.path.startsWith('/uploads/')) {
      lastPath = lastSegment.path;
    } else if (lastSegment.path.startsWith('uploads/')) {
      lastPath = path.join('/', lastSegment.path);
    } else {
      lastPath = path.join('/uploads', lastSegment.path);
    }
    concatContent += `file '${lastPath}'\n`;
  }

  fs.writeFileSync(concatPath, concatContent);
  console.log(`Created Editly video concat file: ${concatPath}`);
  
  return concatPath;
};

const buildEditlyAudioFilter = (audioSegments) => {
  if (audioSegments.length === 0) return null;
  
  let filterComplex = '';
  let inputs = [];
  
  // Build filter for each audio segment
  audioSegments.forEach((segment, index) => {
    // Check if path already includes /uploads (from production) or needs to be added
    const fullPath = segment.path.startsWith('/uploads') ? segment.path : path.join('/uploads', segment.path);
    inputs.push(fullPath);
    
    // Add volume filter if needed
    if (segment.volume !== 1) {
      filterComplex += `[${index + 1}:a]volume=${segment.volume}[a${index}];`;
    } else {
      filterComplex += `[${index + 1}:a]acopy[a${index}];`;
    }
  });
  
  // Mix all audio streams
  if (audioSegments.length > 1) {
    const audioInputs = audioSegments.map((_, index) => `[a${index}]`).join('');
    filterComplex += `${audioInputs}concat=n=${audioSegments.length}:v=0:a=1[aout]`;
  } else {
    filterComplex += `[a0]acopy[aout]`;
  }
  
  return { filterComplex, inputs };
};

const buildEditlyFFmpegCommand = ({ 
  videoConcatFile, 
  audioSegments, 
  audioFilterComplex, 
  outputPath, 
  width, 
  height, 
  fps, 
  useGpu,
  customOutputArgs,
  audioCodec,
  audioBitrate,
  videoCodec,
  videoBitrate
}) => {
  const args = [
    // Video input from concat file
    '-f', 'concat',
    '-safe', '0',
    '-i', videoConcatFile
  ];

  // Add audio inputs
  if (audioFilterComplex && audioFilterComplex.inputs.length > 0) {
    audioFilterComplex.inputs.forEach(audioPath => {
      args.push('-i', audioPath);
    });
  }

  // Video encoding settings
  if (useGpu && videoCodec.includes('nvenc')) {
    // GPU encoding with NVENC
    args.push(
      '-c:v', videoCodec,
      '-preset', 'p5',
      '-cq', '23',
      '-b:v', videoBitrate,
      '-maxrate', '8M',
      '-bufsize', '10M',
      '-profile:v', 'main',
      '-level', '4.1',
      '-rc', 'vbr',
      '-bf', '3',
      '-g', String(fps * 2)
    );
  } else {
    // CPU encoding
    args.push(
      '-c:v', videoCodec || 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-b:v', videoBitrate,
      '-profile:v', 'main',
      '-level', '4.1',
      '-bf', '3',
      '-g', String(fps * 2)
    );
  }

  // Audio processing
  if (audioFilterComplex && audioFilterComplex.filterComplex) {
    args.push(
      '-filter_complex', audioFilterComplex.filterComplex,
      '-map', '0:v',
      '-map', '[aout]',
      '-c:a', audioCodec,
      '-b:a', audioBitrate,
      '-ar', '44100'
    );
  } else {
    args.push('-an'); // No audio
  }

  // Output settings
  args.push(
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    '-r', String(fps),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart'
  );

  // Add custom output arguments if provided
  if (customOutputArgs && Array.isArray(customOutputArgs)) {
    args.push(...customOutputArgs);
  }

  args.push('-y', outputPath);

  return args;
};
