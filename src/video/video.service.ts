import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpeg = require('fluent-ffmpeg');
import * as path from 'path';
import * as fs from 'fs';

export interface VideoSegment {
  imagePath: string;
  audioPath: string;
  subtitles: string[];
  duration: number;
}

@Injectable()
export class VideoService {
  private fontPath: string;
  private outputDir: string;
  private tempDir: string;

  constructor(private configService: ConfigService) {
    this.fontPath =
      this.configService.get<string>('FONT_PATH') ||
      'assets/fonts/JaInan2TTF.ttf';
    this.outputDir = this.configService.get<string>('OUTPUT_DIR') || 'output';
    this.tempDir = this.configService.get<string>('TEMP_DIR') || 'temp';

    [this.outputDir, this.tempDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err: Error | null, metadata: any) => {
        if (err) reject(err);
        else resolve(metadata.format.duration || 0);
      });
    });
  }

  private buildSubtitleFilter(
    subtitles: string[],
    duration: number,
  ): string {
    const timePerSubtitle = duration / subtitles.length;
    const fontSize = 72;

    const filters: string[] = [
      'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
    ];

    subtitles.forEach((subtitle, index) => {
      const startTime = (index * timePerSubtitle).toFixed(2);
      const endTime = ((index + 1) * timePerSubtitle - 0.05).toFixed(2);

      const escapedText = subtitle
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\u2019")
        .replace(/:/g, '\\:')
        .replace(/%/g, '\\%');

      filters.push(
        `drawtext=fontfile='${this.fontPath}':text='${escapedText}':fontcolor=white:fontsize=${fontSize}:borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t\\,${startTime}\\,${endTime})'`,
      );
    });

    return filters.join(',');
  }

  async createSegmentVideo(
    segment: VideoSegment,
    index: number,
    baseFilename: string,
  ): Promise<string> {
    const outputPath = path.join(
      this.tempDir,
      `${baseFilename}_part_${index}.mp4`,
    );

    const filterComplex = this.buildSubtitleFilter(
      segment.subtitles,
      segment.duration,
    );

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(segment.imagePath)
        .loop(segment.duration)
        .input(segment.audioPath)
        .outputOptions([
          '-vf',
          filterComplex,
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-shortest',
          '-pix_fmt',
          'yuv420p',
        ])
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
  }

  async concatenateVideos(
    videoPaths: string[],
    outputFilename: string,
  ): Promise<string> {
    const listFilePath = path.join(this.tempDir, `${outputFilename}_list.txt`);
    const outputPath = path.join(this.outputDir, `${outputFilename}.mp4`);

    const listContent = videoPaths
      .map((p) => `file '${path.resolve(p)}'`)
      .join('\n');
    fs.writeFileSync(listFilePath, listContent);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(listFilePath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(outputPath)
        .on('end', () => {
          fs.unlinkSync(listFilePath);
          resolve(outputPath);
        })
        .on('error', reject)
        .run();
    });
  }

  async cleanupTempFiles(pattern: string): Promise<void> {
    const files = fs.readdirSync(this.tempDir);
    for (const file of files) {
      if (file.includes(pattern)) {
        fs.unlinkSync(path.join(this.tempDir, file));
      }
    }
  }
}
