import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ScriptResult {
  title: string;
  script: string;
  segments: ScriptSegment[];
}

export interface ScriptSegment {
  text: string;
  duration: number;
}

@Injectable()
export class ContentService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async generateScript(
    topic: string,
    imageCount: number,
    maxDuration: number = 60,
  ): Promise<ScriptResult> {
    const prompt = `
당신은 유튜브 숏츠 자동차 전문 스크립트 작가입니다.

주제: ${topic}
이미지 수: ${imageCount}장
목표 길이: ${maxDuration}초 이내

다음 JSON 형식으로 스크립트를 작성해주세요:
{
  "title": "영상 제목 (호기심 유발, 15자 이내)",
  "script": "전체 스크립트 (TTS용, 자연스러운 말투)",
  "segments": [
    {
      "text": "첫 번째 이미지에 해당하는 나레이션",
      "duration": 예상 초 (숫자만)
    },
    ...
  ]
}

규칙:
- segments 배열의 길이는 정확히 ${imageCount}개여야 합니다
- 각 segment는 해당 이미지가 표시되는 동안의 나레이션입니다
- duration 합계가 ${maxDuration}초를 넘지 않도록 합니다
- 한국어로 작성하고, TTS가 읽기 좋은 자연스러운 문장으로 작성합니다
- 숏츠 특성상 첫 3초가 중요하므로 흥미로운 도입부를 작성합니다

JSON만 출력하세요.
`;

    const result = await this.model.generateContent(prompt);
    const response = result.response.text();

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse script JSON from Gemini response');
    }

    const scriptData = JSON.parse(jsonMatch[0]);
    return scriptData as ScriptResult;
  }
}
