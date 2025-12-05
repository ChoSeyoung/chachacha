import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';

const execAsync = promisify(exec);

@Injectable()
export class TtsService {
  private tempDir: string;
  private speed: number = 1.4;
  private ai: GoogleGenAI;
  private styleInstruction: string = '촐싹대고 발랄하게 말해줘:';

  constructor(private configService: ConfigService) {
    this.tempDir = this.configService.get<string>('TEMP_DIR') || 'temp';

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateAudio(text: string, filename: string): Promise<string> {
    const pcmPath = path.join(this.tempDir, `${filename}_raw.pcm`);
    const wavPath = path.join(this.tempDir, `${filename}_temp.wav`);
    const outputPath = path.join(this.tempDir, `${filename}.mp3`);

    // Gemini TTS로 오디오 생성
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: `${this.styleInstruction} ${text}` }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    // Base64 오디오 데이터 추출
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      throw new Error('Failed to generate audio from Gemini TTS');
    }

    // PCM 파일로 저장
    const audioBuffer = Buffer.from(audioData, 'base64');
    fs.writeFileSync(pcmPath, audioBuffer);

    // PCM → WAV 변환 (24000Hz, 16bit, mono)
    await execAsync(
      `ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" "${wavPath}"`,
    );

    // WAV → MP3 변환 + 속도 조절
    await execAsync(
      `ffmpeg -y -i "${wavPath}" -filter:a "atempo=${this.speed}" "${outputPath}"`,
    );

    // 임시 파일 정리
    fs.unlinkSync(pcmPath);
    fs.unlinkSync(wavPath);

    return outputPath;
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
