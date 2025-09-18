## Development Best Practices

### Supported Input Formats
This system supports both simple and complex Editly-compatible JSON formats:

**Simple Format**: 
- Direct clips array with imagePath and duration
- Single audio file for entire video
- Simplified processing pipeline

**Complex Editly Format**:
- Nested editSpec with clips containing layers (image + audio per clip)
- Multiple audio files mixed together
- Advanced FFmpeg configurations with custom output args
- Full backward compatibility with existing Editly workflows

### Format Detection & Processing
- API automatically detects format based on presence of `editSpec` field
- Worker processes each format with appropriate FFmpeg commands
- Complex format supports per-clip audio mixing and volume control
- Both formats support GPU acceleration and scaling

### 1. Project Architecture & Conventions
- Always follow the established microservices architecture (render-api + worker services)
- Maintain separation of concerns between API layer and processing workers
- Use Redis queue patterns for job management and inter-service communication
- Follow Docker containerization best practices for all services

### 2. Feature Development Workflow
- For new features, ensure environment variables, Docker configurations, and API documentation are updated
- Update both render-api and worker services when adding new processing capabilities
- Maintain backward compatibility with existing Editly JSON format
- Test all queue operations and webhook integrations before deployment

### 3. Service Integration & Dependencies
- Use the provided queue management hooks for job creation, status tracking, and cleanup
- Leverage webhook notifications for real-time status updates to n8n workflows
- Ensure Redis connectivity and FFmpeg availability in all worker environments
- Test all changes locally with Docker Compose before pushing to production

### 4. Performance & Scalability Guidelines
- Refer to README.md for performance optimization tips and worker scaling strategies
- Monitor queue depth and worker performance metrics regularly
- Implement proper resource limits for CPU and memory usage in Docker configurations
- Consider GPU worker scaling for high-throughput video processing requirements

### 5. Security & Configuration Management
- Maintain secure environment variable management across development and production
- Validate all input data in API endpoints before adding to queue
- Implement proper file access controls for uploads, outputs, and temporary directories
- Use Docker security best practices and non-root users in containers

### 6. Documentation & Knowledge Sharing
- Document new video processing workflows or FFmpeg configurations in README.md
- Update API_EXAMPLES.md when adding new endpoints or changing request formats
- Maintain clear separation between development, production, and GPU configurations
- Keep Docker Compose files and environment configurations well-documented

### 7. System Architecture Understanding
- Consult the project structure documentation for understanding data flow between services
- Understand queue job lifecycle: creation → processing → completion/failure → cleanup
- Know the integration points between API, Redis queue, workers, and webhook notifications
- Understand GPU vs CPU worker capabilities and scaling implications

### 8. Code Quality & Communication
- Provide clear, concise code snippets and explanations when suggesting changes
- Ensure all code adheres to Node.js and Docker best practices
- Use proper error handling and logging throughout the application stack
- Test FFmpeg commands and video processing logic thoroughly

### 9. Video Processing Expertise
- Always use appropriate FFmpeg configurations for CPU (x264) vs GPU (NVENC) encoding
- Understand video format compatibility and optimization for web streaming
- Consider processing time vs quality trade-offs when implementing new features
- Test video output quality and file sizes across different configurations

### 10. System Integration & Testing
- When in doubt about queue behavior or worker scaling, test with sample jobs first
- Always verify webhook delivery and n8n integration after API changes
- Ensure cleanup operations work correctly to prevent disk space issues
- Test both development and production Docker configurations

### 11. User Experience & Reliability
- Always keep in mind the end-user video processing experience and response times
- Ensure queue status provides meaningful progress updates and error messages
- Consider failover scenarios and graceful degradation when workers are unavailable
- Maintain consistent API responses and error handling across all endpoints

### 12. Performance & Resource Optimization
- Always keep in mind the performance implications of queue depth and worker concurrency
- Strive to write efficient FFmpeg commands that balance speed with output quality
- Monitor Docker resource usage and optimize container configurations
- Consider caching strategies for frequently processed video formats

### 13. Scalability & Growth Planning
- Always keep in mind the scalability of worker pools and Redis queue capacity
- Design features that can scale from single-node to multi-node deployments
- Consider future integration with cloud storage (S3) and auto-scaling platforms
- Plan for geographic distribution and edge processing requirements

### 14. Maintainability & Team Collaboration
- Always keep in mind code maintainability for other developers working with video processing
- Document complex FFmpeg command configurations and their purposes
- Use clear variable names and consistent patterns across API and worker services
- Maintain separation between business logic and infrastructure concerns

### 15. Testing & Quality Assurance
- Always keep in mind the testing of video processing pipelines for correctness and reliability
- Verify output video quality, duration, and file sizes meet requirements
- Test error scenarios: missing files, corrupted inputs, worker failures
- Validate queue recovery and job retry mechanisms under various failure conditions

# Video Render Queue System

This workspace contains a scalable video rendering system designed to replace Editly with improved performance and GPU acceleration.

## Project Overview
- **Type**: Video Processing System with Queue Management
- **Architecture**: Microservices with Redis Queue
- **Technologies**: Node.js, Express, Redis, FFmpeg, Docker
- **Purpose**: Scalable video rendering with CPU/GPU support

## Key Components
- `render-api/` - Express.js API server with Redis queue management
- `worker/` - FFmpeg worker service for video processing  
- `docker-compose.yml` - Multi-service Docker configuration
- `.env` - Environment configuration

## Development Setup Complete ✅
- Dependencies installed for both services
- Docker compose configuration ready
- VS Code tasks configured for common operations
- API endpoints implemented for job management
- Worker service with FFmpeg processing
- Webhook integration for n8n notifications
- Auto-cleanup functionality
- GPU and CPU worker support

## Available VS Code Tasks
- **Start Development Environment** - Launch all services with hot reload
- **Start Production Environment** - Launch production services
- **Start with GPU Support** - Enable GPU workers
- **Stop All Services** - Stop all Docker services
- **View Logs** - Monitor service logs
- **Test API Health** - Check API status

## Key Features Implemented
- Redis-based job queue with Bull for reliability
- FFmpeg with NVENC GPU acceleration support
- Multi-worker scaling (CPU and GPU workers)
- Webhook notifications to n8n or other systems
- Automatic cleanup of old files after configurable time
- Health monitoring and queue statistics
- Complete Docker containerization
- Editly-compatible JSON API format

## API Endpoints Available
- POST /jobs - Create new render job
- GET /jobs/:id - Get job status  
- GET /download/:filename - Download rendered video
- POST /cleanup - Manual cleanup
- GET /health - Health check
- GET /queue/stats - Queue statistics
- GET /disk-usage - Storage information

## Next Steps
1. Test the system with sample video jobs
2. Configure webhook URL for n8n integration  
3. Set up GPU support if NVIDIA hardware available
4. Customize worker scaling based on requirements
5. Deploy to production environment

## Environment Configuration
- Production config in `.env`
- Development config in `.env.development`
- GPU support via Docker Compose profiles
- Worker scaling via environment variables

## Migration from Editly
This system provides a drop-in replacement for Editly with:
- Same JSON format compatibility
- Enhanced performance with queue system
- GPU acceleration support
- Better scalability and monitoring
- Webhook integration capabilities

