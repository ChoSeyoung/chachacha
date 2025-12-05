import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const gTTS = require('gtts');

@Injectable()
export class TtsService {
  private tempDir: string;

  constructor(private configService: ConfigService) {
    this.tempDir = this.configService.get<string>('TEMP_DIR') || 'temp';

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async generateAudio(text: string, filename: string): Promise<string> {
    const outputPath = path.join(this.tempDir, `${filename}.mp3`);

    return new Promise((resolve, reject) => {
      const gtts = new gTTS(text, 'ko');

      gtts.save(outputPath, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve(outputPath);
        }
      });
    });
  }

  async generateSegmentAudios(
    segments: { text: string }[],
    baseFilename: string,
  ): Promise<string[]> {
    const audioPaths: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const audioPath = await this.generateAudio(
        segments[i].text,
        `${baseFilename}_segment_${i}`,
      );
      audioPaths.push(audioPath);
    }

    return audioPaths;
  }
}
