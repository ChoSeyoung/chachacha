import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ScriptResult {
  title: string;
  titleMain: string;      // 첫 줄 (예: "아이오닉6 vs EV6!")
  titleSub: string;       // 둘째 줄 (예: "찐 승자는?") - 노란색
  script: string;
  segments: ScriptSegment[];
}

export interface ScriptSegment {
  text: string;
  subtitles: string[]; // TTS text를 자동 분할한 자막
  duration: number;
  car?: string;        // 이 세그먼트에서 설명하는 차량 (예: 'ioniq6', 'ev6', 'both')
}

// TTS 텍스트를 자막용 청크로 분할 (10글자 이내)
function splitTextToSubtitles(text: string, maxChars: number = 10): string[] {
  const subtitles: string[] = [];

  // 1. 소수점 숫자 보호 (3.5 → 3⎕5)
  const protectedText = text
    .replace(/(\d)\.(\d)/g, '$1⎕$2')  // 소수점 보호
    .replace(/\.{3}/g, '⋯')            // ... → ⋯ (말줄임표 보호)
    .replace(/\.{2}/g, '‥');           // .. → ‥ 보호

  // 2. 문장 부호 기준으로 분리 (연속 문장부호도 함께 캡처: ?!, !!, ?!? 등)
  const sentences = protectedText.split(/([.!?。！？]+)\s*/);

  for (let i = 0; i < sentences.length; i += 2) {
    let sentence = sentences[i];
    const punctuation = sentences[i + 1] || '';
    sentence = (sentence + punctuation).trim();

    if (!sentence) continue;

    // 3. 보호 문자 복원
    sentence = sentence
      .replace(/⎕/g, '.')   // 소수점 복원
      .replace(/⋯/g, '...') // 말줄임표 복원
      .replace(/‥/g, '..');

    // 문장이 maxChars 이하면 그대로 사용
    if (sentence.length <= maxChars) {
      subtitles.push(sentence);
      continue;
    }

    // 긴 문장은 쉼표나 공백 기준으로 분리
    const parts = sentence.split(/,\s*|，\s*/);

    for (const part of parts) {
      if (part.length <= maxChars) {
        if (part.trim()) subtitles.push(part.trim());
        continue;
      }

      // 공백 기준으로 분리
      const words = part.split(/\s+/);
      let currentChunk = '';

      for (const word of words) {
        if (currentChunk.length + word.length + 1 <= maxChars) {
          currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
        } else {
          if (currentChunk) subtitles.push(currentChunk);

          // 단어 자체가 maxChars보다 길면 강제 분할
          if (word.length > maxChars) {
            for (let j = 0; j < word.length; j += maxChars) {
              subtitles.push(word.slice(j, j + maxChars));
            }
            currentChunk = '';
          } else {
            currentChunk = word;
          }
        }
      }

      if (currentChunk) subtitles.push(currentChunk);
    }
  }

  return subtitles.filter(s => s.trim());
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
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  async generateScript(
    topic: string,
    imageCount: number,
    maxDuration: number = 60,
  ): Promise<ScriptResult> {
    const prompt = `
당신은 한국형 양산 숏츠 전문가입니다.
조회수 터지는 숏츠 공식을 완벽히 이해하고 있으며, 시청자의 이목을 단번에 사로잡는 후킹 멘트와 중독성 있는 전개를 만들어냅니다.
자동차/전기차 콘텐츠에 특화되어 있으며, MZ세대가 열광하는 트렌디한 표현을 자유자재로 구사합니다.

주제: ${topic}
세그먼트 수: ${imageCount}개
목표 길이: ${maxDuration}초 이내

중요: TTS 속도가 1.4배 빠르므로, 일반 속도 대비 조금 더 많은 내용을 작성하세요.
촐싹대고 발랄한 말투로 작성해주세요!

**핵심**: 주제를 정확히 분석하세요!
- "vs", "비교", "대결" 등이 있으면 → 비교 영상
- 그 외에는 → 정보/설명 영상 (주제에 대한 지식 전달)

다음 JSON 형식으로 스크립트를 작성해주세요:
{
  "titleMain": "메인 제목 (주제를 임팩트 있게 표현)",
  "titleSub": "서브 제목/후킹 문구 (호기심 유발)",
  "script": "전체 스크립트 (TTS용, 자연스러운 말투)",
  "segments": [
    {
      "text": "나레이션 내용 (발랄하고 촐싹대는 말투로)",
      "duration": 예상 초 (숫자만, 1.4배 TTS 기준)
    },
    ...
  ]
}

규칙:
- segments 배열의 길이는 정확히 ${imageCount}개여야 합니다
- 각 segment는 영상의 각 파트 나레이션입니다
- 촐싹대고 발랄한 말투로 작성하세요 (예: "와~ 대박!", "진짜 미쳤어요!", "이거 실화냐?!")
- duration 합계가 ${maxDuration}초를 넘지 않도록 합니다
- 한국어로 작성하고, 1.4배 빠른 TTS에서도 명확하게 들리는 문장으로 작성합니다
- 숏츠 특성상 첫 2초가 중요하므로 강렬한 도입부를 작성합니다
- 이모지는 절대 사용하지 마세요. titleMain, titleSub, script, segments 모두에서 이모지 금지!
- titleMain, titleSub는 주제에 맞게 작성 (비교 영상이 아니면 vs 쓰지 마세요!)
- 정보/설명 영상이면 "왜 그런지", "얼마나 그런지", "어떻게 해야 하는지" 등 유익한 정보를 전달하세요
- 구체적인 수치나 팩트를 포함하면 더 좋습니다

JSON만 출력하세요. subtitles 필드는 포함하지 마세요 (자동 생성됨).
`;

    const result = await this.model.generateContent(prompt);
    const response = result.response.text();

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse script JSON from Gemini response');
    }

    const scriptData = JSON.parse(jsonMatch[0]);

    // 이모지 제거 함수
    const removeEmojis = (text: string): string => {
      return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '').trim();
    };

    // TTS 텍스트에서 자막을 자동 생성 (TTS와 동일한 내용) - 이모지 제거 적용
    const segments = scriptData.segments.map((segment: any) => {
      const cleanText = removeEmojis(segment.text);
      return {
        text: cleanText,
        subtitles: splitTextToSubtitles(cleanText, 10),
        duration: segment.duration,
        car: segment.car || 'both',
      };
    });

    // 제목 조합 (하위 호환성) - 이모지 제거 적용
    const titleMain = removeEmojis(scriptData.titleMain || scriptData.title || '');
    const titleSub = removeEmojis(scriptData.titleSub || '');
    const title = titleSub ? `${titleMain}\n${titleSub}` : titleMain;

    return {
      title,
      titleMain,
      titleSub,
      script: scriptData.script,
      segments,
    } as ScriptResult;
  }
}
