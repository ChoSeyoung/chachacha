import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentService, ScriptResult } from '../content/content.service';
import { TtsService } from '../tts/tts.service';
import { RemotionRenderService, RenderSegment, PreviewSegment } from '../remotion/render.service';
import * as fs from 'fs';
import * as path from 'path';

export interface ShortsRequest {
  topic: string;
  images: string[];
  imagesByVehicle?: Record<string, string[]>;  // 차량별 이미지 (예: { ioniq6: [...], ev6: [...] })
  projectName?: string;
  maxDuration?: number;
  fontPath?: string;
  segmentCount?: number;  // 스크립트 세그먼트 수 (기본 3)
  imageIntervalSeconds?: number;  // 이미지 전환 간격 (기본 3초)
  titleMain?: string;  // 메인 제목 (흰색) - 직접 지정
  titleSub?: string;   // 서브 제목 (노란색) - 직접 지정
}

export interface ShortsResult {
  videoPath: string;
  projectPath: string;
  title: string;
  script: ScriptResult;
}

export interface ScriptOnlyResult {
  projectPath: string;
  scriptPath: string;
  script: ScriptResult;
}

@Injectable()
export class ShortsService {
  private readonly logger = new Logger(ShortsService.name);
  private readonly vehiclesDir = 'assets/vehicles';
  private readonly projectsDir = 'assets/projects';
  private readonly tempDir = 'temp';
  private readonly defaultFontPath = 'assets/fonts/Jalnan2TTF.ttf';

  constructor(
    private configService: ConfigService,
    private contentService: ContentService,
    private ttsService: TtsService,
    private remotionRenderService: RemotionRenderService,
  ) {
    [this.vehiclesDir, this.projectsDir, this.tempDir].forEach((dir) => {
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

  private async getAudioDuration(audioPath: string): Promise<number> {
    // ffprobe를 사용하여 오디오 길이 확인
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    );
    return parseFloat(stdout.trim());
  }

  private cleanupTempFiles(pattern: string): void {
    if (!fs.existsSync(this.tempDir)) return;
    const files = fs.readdirSync(this.tempDir);
    for (const file of files) {
      if (file.includes(pattern)) {
        fs.unlinkSync(path.join(this.tempDir, file));
      }
    }
  }

  /**
   * 스크립트만 생성하고 저장 (검토용)
   */
  async generateScriptOnly(request: ShortsRequest): Promise<ScriptOnlyResult> {
    const {
      topic,
      projectName,
      maxDuration = 60,
      segmentCount = 3,
    } = request;

    const projectDir = this.createProjectFolder(projectName || topic);
    this.logger.log(`Project folder: ${projectDir}`);

    // 스크립트 생성
    this.logger.log(`Generating script for: ${topic}`);
    const script = await this.contentService.generateScript(
      topic,
      segmentCount,
      maxDuration,
    );
    this.logger.log(`Script generated: ${script.title}`);

    const scriptPath = path.join(projectDir, 'script.json');
    fs.writeFileSync(
      scriptPath,
      JSON.stringify(script, null, 2),
      'utf-8',
    );

    this.logger.log(`Script saved to: ${scriptPath}`);

    return {
      projectPath: projectDir,
      scriptPath,
      script,
    };
  }

  /**
   * 기존 스크립트를 사용하여 영상 렌더링
   */
  async renderFromScript(
    projectPath: string,
    images: string[],
    options?: {
      imagesByVehicle?: Record<string, string[]>;
      fontPath?: string;
      imageIntervalSeconds?: number;
      titleMain?: string;
      titleSub?: string;
    }
  ): Promise<ShortsResult> {
    const {
      imagesByVehicle,
      fontPath,
      imageIntervalSeconds = 3,
      titleMain: requestTitleMain,
      titleSub: requestTitleSub,
    } = options || {};

    const scriptPath = path.join(projectPath, 'script.json');
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Script not found: ${scriptPath}`);
    }

    const script: ScriptResult = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
    this.logger.log(`Loaded script from: ${scriptPath}`);

    // 폰트 경로 결정
    const resolvedFontPath = fontPath || this.defaultFontPath;
    const fontExists = fs.existsSync(resolvedFontPath);
    const timestamp = Date.now().toString();

    // TTS 오디오 생성
    this.logger.log(`[1/3] Generating TTS audio...`);
    const audioPaths = await this.ttsService.generateSegmentAudios(
      script.segments,
      timestamp,
    );
    this.logger.log(`Generated ${audioPaths.length} audio segments`);

    // 렌더링 세그먼트 준비
    this.logger.log(`[2/3] Preparing render segments...`);
    const renderSegments: RenderSegment[] = [];

    for (let i = 0; i < audioPaths.length; i++) {
      const duration = await this.getAudioDuration(audioPaths[i]);
      let segmentImages: string[] | undefined;
      const carType = script.segments[i].car;

      if (imagesByVehicle && carType && carType !== 'both') {
        segmentImages = imagesByVehicle[carType];
        if (segmentImages && segmentImages.length > 0) {
          this.logger.log(`Segment ${i + 1}: Using ${carType} images (${segmentImages.length}개)`);
        }
      }

      renderSegments.push({
        audioPath: audioPaths[i],
        subtitles: script.segments[i].subtitles || [script.segments[i].text],
        durationInSeconds: duration,
        images: segmentImages?.map((img) => path.resolve(img)),
      });

      this.logger.log(`Segment ${i + 1}/${audioPaths.length} prepared (${duration.toFixed(2)}s, car: ${carType || 'both'})`);
    }

    // Remotion으로 렌더링
    this.logger.log(`[3/3] Rendering video with Remotion...`);
    this.logger.log(`Images: ${images.length}개 (${imageIntervalSeconds}초 간격 순환)`);
    if (fontExists) {
      this.logger.log(`Using font: ${resolvedFontPath}`);
    }
    const outputPath = path.join(projectPath, 'shorts.mp4');

    const finalTitleMain = requestTitleMain || script.titleMain;
    const finalTitleSub = requestTitleSub || script.titleSub;

    await this.remotionRenderService.render({
      segments: renderSegments,
      images: images.map((img) => path.resolve(img)),
      outputPath,
      title: script.title,
      titleMain: finalTitleMain,
      titleSub: finalTitleSub,
      fontPath: fontExists ? path.resolve(resolvedFontPath) : undefined,
      imageIntervalSeconds,
    });

    // 임시 파일 정리
    this.logger.log(`Cleaning up temp files...`);
    this.cleanupTempFiles(timestamp);

    this.logger.log(`Video created: ${outputPath}`);

    return {
      videoPath: outputPath,
      projectPath,
      title: script.title,
      script,
    };
  }

  /**
   * 프리뷰 영상 생성 (TTS 없음, 무음)
   * script.json의 duration 필드를 사용하여 타이밍 결정
   */
  async previewFromScript(
    projectPath: string,
    images: string[],
    options?: {
      fontPath?: string;
      imageIntervalSeconds?: number;
      titleMain?: string;
      titleSub?: string;
    }
  ): Promise<{ previewPath: string; script: ScriptResult }> {
    const {
      fontPath,
      imageIntervalSeconds = 3,
      titleMain: requestTitleMain,
      titleSub: requestTitleSub,
    } = options || {};

    const scriptPath = path.join(projectPath, 'script.json');
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Script not found: ${scriptPath}`);
    }

    const script: ScriptResult = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
    this.logger.log(`[Preview] Loaded script from: ${scriptPath}`);

    // 폰트 경로 결정
    const resolvedFontPath = fontPath || this.defaultFontPath;
    const fontExists = fs.existsSync(resolvedFontPath);

    // 프리뷰 세그먼트 준비 (TTS 없이 duration 필드 사용)
    this.logger.log(`[Preview] Preparing segments (no TTS)...`);
    const previewSegments: PreviewSegment[] = script.segments.map((segment, i) => {
      const duration = segment.duration || 5; // 기본 5초
      this.logger.log(`Segment ${i + 1}: ${duration}s`);
      return {
        subtitles: segment.subtitles || [segment.text],
        durationInSeconds: duration,
      };
    });

    // Remotion으로 프리뷰 렌더링
    this.logger.log(`[Preview] Rendering silent preview...`);
    this.logger.log(`Images: ${images.length}개 (${imageIntervalSeconds}초 간격)`);
    const outputPath = path.join(projectPath, 'preview.mp4');

    const finalTitleMain = requestTitleMain || script.titleMain;
    const finalTitleSub = requestTitleSub || script.titleSub;

    await this.remotionRenderService.renderPreview({
      segments: previewSegments,
      images: images.map((img) => path.resolve(img)),
      outputPath,
      titleMain: finalTitleMain,
      titleSub: finalTitleSub,
      fontPath: fontExists ? path.resolve(resolvedFontPath) : undefined,
      imageIntervalSeconds,
    });

    this.logger.log(`[Preview] Created: ${outputPath}`);

    return {
      previewPath: outputPath,
      script,
    };
  }

  async createShorts(request: ShortsRequest): Promise<ShortsResult> {
    const {
      topic,
      images,
      imagesByVehicle,
      projectName,
      maxDuration = 60,
      fontPath,
      segmentCount = 3,
      imageIntervalSeconds = 3,
      titleMain: requestTitleMain,
      titleSub: requestTitleSub,
    } = request;

    // 폰트 경로 결정 (지정된 것 또는 기본값)
    const resolvedFontPath = fontPath || this.defaultFontPath;
    const fontExists = fs.existsSync(resolvedFontPath);
    const timestamp = Date.now().toString();

    const projectDir = this.createProjectFolder(projectName || topic);
    this.logger.log(`Project folder: ${projectDir}`);

    // 1. 스크립트 생성 (이미지 수와 무관하게 segmentCount 사용)
    this.logger.log(`[1/4] Generating script for: ${topic}`);
    const script = await this.contentService.generateScript(
      topic,
      segmentCount,
      maxDuration,
    );
    this.logger.log(`Script generated: ${script.title}`);

    fs.writeFileSync(
      path.join(projectDir, 'script.json'),
      JSON.stringify(script, null, 2),
      'utf-8',
    );

    // 2. TTS 오디오 생성
    this.logger.log(`[2/4] Generating TTS audio...`);
    const audioPaths = await this.ttsService.generateSegmentAudios(
      script.segments,
      timestamp,
    );
    this.logger.log(`Generated ${audioPaths.length} audio segments`);

    // 3. 렌더링 세그먼트 준비 (오디오 기반)
    this.logger.log(`[3/4] Preparing render segments...`);
    const renderSegments: RenderSegment[] = [];

    for (let i = 0; i < audioPaths.length; i++) {
      const duration = await this.getAudioDuration(audioPaths[i]);

      // 세그먼트별 이미지 결정 (car 필드 기반)
      let segmentImages: string[] | undefined;
      const carType = script.segments[i].car;

      if (imagesByVehicle && carType && carType !== 'both') {
        // 특정 차량 이미지만 사용
        segmentImages = imagesByVehicle[carType];
        if (segmentImages && segmentImages.length > 0) {
          this.logger.log(`Segment ${i + 1}: Using ${carType} images (${segmentImages.length}개)`);
        }
      }

      renderSegments.push({
        audioPath: audioPaths[i],
        subtitles: script.segments[i].subtitles || [script.segments[i].text],
        durationInSeconds: duration,
        images: segmentImages?.map((img) => path.resolve(img)),
      });

      this.logger.log(`Segment ${i + 1}/${audioPaths.length} prepared (${duration.toFixed(2)}s, car: ${carType || 'both'})`);
    }

    // 4. Remotion으로 렌더링
    this.logger.log(`[4/4] Rendering video with Remotion...`);
    this.logger.log(`Images: ${images.length}개 (${imageIntervalSeconds}초 간격 순환)`);
    if (fontExists) {
      this.logger.log(`Using font: ${resolvedFontPath}`);
    } else {
      this.logger.warn(`Font not found: ${resolvedFontPath}, using system font`);
    }
    const outputPath = path.join(projectDir, 'shorts.mp4');

    // 제목: request에서 직접 지정한 값 우선, 없으면 script에서 가져옴
    const finalTitleMain = requestTitleMain || script.titleMain;
    const finalTitleSub = requestTitleSub || script.titleSub;

    await this.remotionRenderService.render({
      segments: renderSegments,
      images: images.map((img) => path.resolve(img)),
      outputPath,
      title: script.title,
      titleMain: finalTitleMain,
      titleSub: finalTitleSub,
      fontPath: fontExists ? path.resolve(resolvedFontPath) : undefined,
      imageIntervalSeconds,
    });

    // 임시 파일 정리
    this.logger.log(`Cleaning up temp files...`);
    this.cleanupTempFiles(timestamp);

    this.logger.log(`Video created: ${outputPath}`);

    return {
      videoPath: outputPath,
      projectPath: projectDir,
      title: script.title,
      script,
    };
  }
}
