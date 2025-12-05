import { Injectable, Logger } from '@nestjs/common';
import { ContentService, ScriptResult } from '../content/content.service';
import { TtsService } from '../tts/tts.service';
import { VideoService, VideoSegment } from '../video/video.service';

export interface ShortsRequest {
  topic: string;
  images: string[];
  maxDuration?: number;
}

export interface ShortsResult {
  videoPath: string;
  title: string;
  script: ScriptResult;
}

@Injectable()
export class ShortsService {
  private readonly logger = new Logger(ShortsService.name);

  constructor(
    private contentService: ContentService,
    private ttsService: TtsService,
    private videoService: VideoService,
  ) {}

  async createShorts(request: ShortsRequest): Promise<ShortsResult> {
    const { topic, images, maxDuration = 60 } = request;
    const timestamp = Date.now().toString();

    this.logger.log(`[1/4] Generating script for: ${topic}`);
    const script = await this.contentService.generateScript(
      topic,
      images.length,
      maxDuration,
    );
    this.logger.log(`Script generated: ${script.title}`);

    this.logger.log(`[2/4] Generating TTS audio...`);
    const audioPaths = await this.ttsService.generateSegmentAudios(
      script.segments,
      timestamp,
    );
    this.logger.log(`Generated ${audioPaths.length} audio segments`);

    this.logger.log(`[3/4] Creating video segments...`);
    const segmentVideos: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const duration = await this.videoService.getAudioDuration(audioPaths[i]);

      const segment: VideoSegment = {
        imagePath: images[i],
        audioPath: audioPaths[i],
        subtitleText: script.segments[i].text,
        duration: duration,
      };

      const videoPath = await this.videoService.createSegmentVideo(
        segment,
        i,
        timestamp,
      );
      segmentVideos.push(videoPath);
      this.logger.log(`Segment ${i + 1}/${images.length} created`);
    }

    this.logger.log(`[4/4] Concatenating final video...`);
    const finalVideoPath = await this.videoService.concatenateVideos(
      segmentVideos,
      `shorts_${timestamp}`,
    );

    this.logger.log(`Cleaning up temp files...`);
    await this.videoService.cleanupTempFiles(timestamp);

    this.logger.log(`Video created: ${finalVideoPath}`);

    return {
      videoPath: finalVideoPath,
      title: script.title,
      script,
    };
  }
}
