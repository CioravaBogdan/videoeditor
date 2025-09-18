const fs = require('fs');
const path = require('path');

const cleanupOldFiles = async (uploadsDir, outputsDir, tempDir, hoursOld = 2) => {
  const cutoffTime = Date.now() - (hoursOld * 60 * 60 * 1000);
  let deletedFiles = 0;
  let freedSpace = 0;

  const cleanDirectory = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
      return;
    }

    const files = fs.readdirSync(dirPath);
    
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      
      try {
        const stats = fs.statSync(filePath);
        
        if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
          const fileSize = stats.size;
          fs.unlinkSync(filePath);
          deletedFiles++;
          freedSpace += fileSize;
          console.log(`Deleted old file: ${filePath} (${formatBytes(fileSize)})`);
        } else if (stats.isDirectory()) {
          // Recursively clean subdirectories
          cleanDirectory(filePath);
          
          // Remove empty directories
          try {
            const remainingFiles = fs.readdirSync(filePath);
            if (remainingFiles.length === 0) {
              fs.rmdirSync(filePath);
              console.log(`Removed empty directory: ${filePath}`);
            }
          } catch (error) {
            // Directory not empty or other error, ignore
          }
        }
      } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
      }
    });
  };

  console.log(`Starting worker cleanup of files older than ${hoursOld} hours...`);

  // Clean all directories
  cleanDirectory(uploadsDir);
  cleanDirectory(outputsDir);  
  cleanDirectory(tempDir);

  console.log(`Worker cleanup completed: ${deletedFiles} files deleted, ${formatBytes(freedSpace)} freed`);

  return {
    deletedFiles,
    freedSpace,
    freedSpaceFormatted: formatBytes(freedSpace)
  };
};

// Format bytes to human readable format
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

module.exports = {
  cleanupOldFiles,
  formatBytes
};
