const fs = require('fs');
const path = require('path');

const cleanupOldFiles = async (uploadsDir, outputsDir, tempDir, hoursOld = 2) => {
  const cutoffTime = Date.now() - (hoursOld * 60 * 60 * 1000);
  let deletedFiles = 0;
  let freedSpace = 0;

  const cleanDirectory = (dirPath, skipActive = false) => {
    if (!fs.existsSync(dirPath)) {
      return;
    }

    const files = fs.readdirSync(dirPath);
    
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
        // Skip files that are currently being processed
        if (skipActive && isFileInUse(filePath)) {
          console.log(`Skipping active file: ${filePath}`);
          return;
        }

        try {
          const fileSize = stats.size;
          fs.unlinkSync(filePath);
          deletedFiles++;
          freedSpace += fileSize;
          console.log(`Deleted old file: ${filePath} (${formatBytes(fileSize)})`);
        } catch (error) {
          console.error(`Failed to delete file ${filePath}:`, error.message);
        }
      } else if (stats.isDirectory()) {
        // Recursively clean subdirectories
        cleanDirectory(filePath, skipActive);
        
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
    });
  };

  console.log(`Starting cleanup of files older than ${hoursOld} hours...`);

  // Clean uploads directory
  cleanDirectory(uploadsDir, true);
  
  // Clean outputs directory
  cleanDirectory(outputsDir, true);
  
  // Clean temp directory
  cleanDirectory(tempDir, false);

  console.log(`Cleanup completed: ${deletedFiles} files deleted, ${formatBytes(freedSpace)} freed`);

  return {
    deletedFiles,
    freedSpace,
    freedSpaceFormatted: formatBytes(freedSpace)
  };
};

// Check if file is currently in use (basic check)
const isFileInUse = (filePath) => {
  try {
    // Try to rename the file to itself (this will fail if file is in use)
    fs.renameSync(filePath, filePath);
    return false;
  } catch (error) {
    // If rename fails, file might be in use
    return error.code === 'EBUSY' || error.code === 'ENOENT';
  }
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

// Get directory size
const getDirectorySize = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  let totalSize = 0;
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      totalSize += getDirectorySize(filePath);
    } else {
      totalSize += stats.size;
    }
  });

  return totalSize;
};

// Clean specific file by path
const cleanupFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      
      fs.unlinkSync(filePath);
      console.log(`Cleaned up file: ${filePath} (${formatBytes(fileSize)})`);
      
      return { success: true, size: fileSize };
    }
    
    return { success: false, error: 'File not found' };
    
  } catch (error) {
    console.error(`Failed to cleanup file ${filePath}:`, error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  cleanupOldFiles,
  getDirectorySize,
  cleanupFile,
  formatBytes
};
