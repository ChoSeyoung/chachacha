import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentService, ScriptResult } from '../content/content.service';
import { TtsService } from '../tts/tts.service';
import { VideoService, VideoSegment } from '../video/video.service';
import * as fs from 'fs';
import * as path from 'path';

export interface ShortsRequest {
  topic: string;
  images: string[];
  projectName?: string;
  maxDuration?: number;
}

export interface ShortsResult {
  videoPath: string;
  projectPath: string;
  title: string;
  script: ScriptResult;
}

@Injectable()
export class ShortsService {
  private readonly logger = new Logger(ShortsService.name);
  private readonly vehiclesDir = 'assets/vehicles';
  private readonly projectsDir = 'assets/projects';

  constructor(
    private configService: ConfigService,
    private contentService: ContentService,
    private ttsService: TtsService,
    private videoService: VideoService,
  ) {
    [this.vehiclesDir, this.projectsDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  listVehicles(): string[] {
    if (!fs.existsSync(this.vehiclesDir)) return [];
    return fs.readdirSync(this.vehiclesDir).filter((f) => {
      return fs.statSync(path.join(this.vehiclesDir, f)).isDirectory();
    });
  }

  getVehicleImages(vehicleName: string): string[] {
    const vehicleDir = path.join(this.vehiclesDir, vehicleName);
    if (!fs.existsSync(vehicleDir)) return [];

    const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.avif'];
    return fs
      .readdirSync(vehicleDir)
      .filter((f) => extensions.includes(path.extname(f).toLowerCase()))
      .map((f) => path.resolve(vehicleDir, f));
  }

  listProjects(): string[] {
    if (!fs.existsSync(this.projectsDir)) return [];
    return fs.readdirSync(this.projectsDir).filter((f) => {
      return fs.statSync(path.join(this.projectsDir, f)).isDirectory();
    });
  }

  createVehicleFolder(vehicleName: string): string {
    const vehicleDir = path.join(this.vehiclesDir, vehicleName);
    if (!fs.existsSync(vehicleDir)) {
      fs.mkdirSync(vehicleDir, { recursive: true });
    }
    return path.resolve(vehicleDir);
  }

  private createProjectFolder(projectName: string): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeName = projectName.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
    const folderName = `${date}_${safeName}`;
    const projectDir = path.join(this.projectsDir, folderName);

    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    return projectDir;
  }

  async createShorts(request: ShortsRequest): Promise<ShortsResult> {
    const { topic, images, projectName, maxDuration = 60 } = request;
    const timestamp = Date.now().toString();

    const projectDir = this.createProjectFolder(projectName || topic);
    this.logger.log(`Project folder: ${projectDir}`);

    this.logger.log(`[1/4] Generating script for: ${topic}`);
    const script = await this.contentService.generateScript(
      topic,
      images.length,
      maxDuration,
    );
    this.logger.log(`Script generated: ${script.title}`);

    fs.writeFileSync(
      path.join(projectDir, 'script.json'),
      JSON.stringify(script, null, 2),
      'utf-8',
    );

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

    const projectVideoPath = path.join(projectDir, 'shorts.mp4');
    fs.copyFileSync(finalVideoPath, projectVideoPath);
    fs.unlinkSync(finalVideoPath);

    this.logger.log(`Cleaning up temp files...`);
    await this.videoService.cleanupTempFiles(timestamp);

    this.logger.log(`Video created: ${projectVideoPath}`);

    return {
      videoPath: projectVideoPath,
      projectPath: projectDir,
      title: script.title,
      script,
    };
  }
}
