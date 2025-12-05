import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

export interface RenderSegment {
  audioPath: string;
  subtitles: string[];
  durationInSeconds: number;
  images?: string[];  // 이 세그먼트에서 사용할 이미지들
}

export interface RenderRequest {
  segments: RenderSegment[];
  images: string[];  // 기본 이미지 (세그먼트별 이미지가 없을 때 사용)
  outputPath: string;
  title?: string;        // 전체 제목 (하위 호환성)
  titleMain?: string;    // 메인 제목 (흰색)
  titleSub?: string;     // 서브 제목 (노란색)
  fontPath?: string;
  imageIntervalSeconds?: number;  // 이미지 전환 간격 (기본 3초)
}

@Injectable()
export class RemotionRenderService {
  private readonly logger = new Logger(RemotionRenderService.name);
  private bundled: string | null = null;
  private readonly fps = 30;
  private assetServer: http.Server | null = null;
  private assetServerPort = 3456;

  constructor(private configService: ConfigService) {}

  private async ensureBundled(): Promise<string> {
    if (this.bundled) {
      return this.bundled;
    }

    this.logger.log('Bundling Remotion project...');

    // dist에서 실행되므로 src 폴더의 index.ts를 참조해야 함
    const entryPoint = path.join(process.cwd(), 'src', 'remotion', 'index.ts');

    this.bundled = await bundle({
      entryPoint,
      webpackOverride: (config) => config,
    });

    this.logger.log('Bundling complete');
    return this.bundled;
  }

  private startAssetServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        // URL 디코딩
        const urlPath = decodeURIComponent(req.url || '/');

        // /assets/ 프리픽스 제거하고 실제 경로로 변환
        let filePath = urlPath.replace(/^\/assets\//, '/');

        // 파일이 존재하는지 확인
        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end('File not found: ' + filePath);
          return;
        }

        // MIME 타입 결정
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
          '.m4a': 'audio/mp4',
          '.ttf': 'font/ttf',
          '.otf': 'font/otf',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
        };

        const contentType = mimeTypes[ext] || 'application/octet-stream';

        // 파일 스트림으로 응답
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Access-Control-Allow-Origin': '*',
        });

        fs.createReadStream(filePath).pipe(res);
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          this.assetServerPort++;
          server.listen(this.assetServerPort);
        } else {
          reject(err);
        }
      });

      server.listen(this.assetServerPort, () => {
        this.assetServer = server;
        this.logger.log(`Asset server started on port ${this.assetServerPort}`);
        resolve(this.assetServerPort);
      });
    });
  }

  private stopAssetServer(): void {
    if (this.assetServer) {
      this.assetServer.close();
      this.assetServer = null;
      this.logger.log('Asset server stopped');
    }
  }

  private pathToUrl(filePath: string, port: number): string {
    const absolutePath = path.resolve(filePath);
    return `http://localhost:${port}/assets${absolutePath}`;
  }

  async render(request: RenderRequest): Promise<string> {
    const {
      segments,
      images,
      outputPath,
      title = '',
      titleMain = '',
      titleSub = '',
      fontPath,
      imageIntervalSeconds = 3
    } = request;

    // 에셋 서버 시작
    const port = await this.startAssetServer();

    try {
      // 세그먼트 데이터를 Remotion props 형식으로 변환 (HTTP URL 사용)
      const remotionSegments = segments.map((segment) => ({
        audioPath: this.pathToUrl(segment.audioPath, port),
        subtitles: segment.subtitles,
        durationInFrames: Math.ceil(segment.durationInSeconds * this.fps),
        images: segment.images?.map((img) => this.pathToUrl(img, port)) || [],
      }));

      // 기본 이미지 URL 변환
      const imageUrls = images.map((img) => this.pathToUrl(img, port));

      // 폰트 URL 생성 (폰트가 있으면)
      const fontUrl = fontPath ? this.pathToUrl(fontPath, port) : undefined;

      // 총 프레임 수 계산
      const totalDurationInFrames = remotionSegments.reduce(
        (sum, seg) => sum + seg.durationInFrames,
        0
      );

      this.logger.log(`Total duration: ${totalDurationInFrames} frames (${totalDurationInFrames / this.fps}s)`);
      if (fontUrl) {
        this.logger.log(`Using custom font: ${fontPath}`);
      }

      // 번들링
      const bundleLocation = await this.ensureBundled();

      // 컴포지션 선택
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'ShortsVideo',
        inputProps: {
          segments: remotionSegments,
          images: imageUrls,
          title,
          titleMain,
          titleSub,
          fontUrl,
          imageIntervalSeconds,
        },
      });

      // 동적으로 duration 설정
      const compositionWithDuration = {
        ...composition,
        durationInFrames: totalDurationInFrames,
      };

      // 출력 디렉토리 확인
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      this.logger.log(`Rendering video to: ${outputPath}`);

      // 렌더링
      await renderMedia({
        composition: compositionWithDuration,
        serveUrl: bundleLocation,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps: {
          segments: remotionSegments,
          images: imageUrls,
          title,
          titleMain,
          titleSub,
          fontUrl,
          imageIntervalSeconds,
        },
      });

      this.logger.log('Rendering complete');
      return outputPath;
    } finally {
      // 에셋 서버 종료
      this.stopAssetServer();
    }
  }
}
