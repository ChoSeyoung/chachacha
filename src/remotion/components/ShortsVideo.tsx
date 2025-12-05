import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useVideoConfig,
} from 'remotion';
import { ImageSlide } from './ImageSlide';
import { Subtitle } from './Subtitle';

export interface SegmentData {
  audioPath: string;
  subtitles: string[];
  durationInFrames: number;
  images?: string[];  // 이 세그먼트에서 사용할 이미지들
}

export interface ShortsVideoInput {
  segments: SegmentData[];
  images: string[];
  titleMain?: string;
  titleSub?: string;
  title?: string;  // 하위 호환성
  fontUrl?: string;
  imageIntervalSeconds?: number;
}

interface ShortsVideoProps {
  segments: SegmentData[];
  images: string[];
  titleMain?: string;
  titleSub?: string;
  title?: string;
  fontUrl?: string;
  imageIntervalSeconds?: number;
  [key: string]: unknown;
}

// 레이아웃 상수
const LAYOUT = {
  width: 1080,
  height: 1920,
  titleHeight: 630,   // 상단 여백 (제목 영역)
  imageSize: 1080,    // 정방형
  bottomHeight: 210,  // 하단 여백
};

export const ShortsVideo: React.FC<ShortsVideoProps> = ({
  segments,
  images,
  titleMain = '',
  titleSub = '',
  title = '',
  fontUrl,
  imageIntervalSeconds = 3,
}) => {
  const { fps } = useVideoConfig();

  // 제목 처리 (하위 호환성: title이 있으면 파싱 시도)
  let displayTitleMain = titleMain;
  let displayTitleSub = titleSub;
  if (!titleMain && title) {
    const parts = title.split('\n');
    displayTitleMain = parts[0] || '';
    displayTitleSub = parts[1] || '';
  }

  // 총 프레임 수 계산
  const totalFrames = segments.reduce((sum, seg) => sum + seg.durationInFrames, 0);

  // 이미지 전환 간격 (프레임)
  const imageIntervalFrames = Math.floor(imageIntervalSeconds * fps);

  // 오디오 세그먼트 시작 프레임 계산
  let audioStartFrame = 0;
  const audioSegments = segments.map((segment) => {
    const start = audioStartFrame;
    audioStartFrame += segment.durationInFrames;
    return { ...segment, startFrame: start };
  });

  // 세그먼트별 이미지 슬라이드 생성
  const imageSlides: { startFrame: number; durationInFrames: number; src: string }[] = [];

  for (const segment of audioSegments) {
    const segmentImages = segment.images && segment.images.length > 0
      ? segment.images
      : images;

    if (segmentImages.length === 0) continue;

    let currentFrame = segment.startFrame;
    let imageIndex = 0;
    const segmentEndFrame = segment.startFrame + segment.durationInFrames;

    while (currentFrame < segmentEndFrame) {
      const remainingFrames = segmentEndFrame - currentFrame;
      const slideDuration = Math.min(imageIntervalFrames, remainingFrames);

      imageSlides.push({
        startFrame: currentFrame,
        durationInFrames: slideDuration,
        src: segmentImages[imageIndex % segmentImages.length],
      });

      currentFrame += slideDuration;
      imageIndex++;
    }
  }

  const fontFamily = fontUrl ? 'CustomSubtitleFont, sans-serif' : 'sans-serif';

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* 폰트 로드 */}
      {fontUrl && (
        <style>
          {`
            @font-face {
              font-family: 'CustomSubtitleFont';
              src: url('${fontUrl}') format('truetype');
              font-weight: normal;
              font-style: normal;
            }
          `}
        </style>
      )}

      {/* 상단 제목 영역 (630px) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: LAYOUT.width,
          height: LAYOUT.titleHeight,
          backgroundColor: '#000',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '40px 60px',
        }}
      >
        {/* 제목 컨테이너 - 항상 두 줄로 표시 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 20,
          }}
        >
          {/* 메인 제목 (흰색) - 첫 번째 줄 */}
          <div
            style={{
              fontSize: 72,
              fontWeight: 'bold',
              fontFamily,
              color: 'white',
              textAlign: 'center',
              lineHeight: 1.3,
              wordBreak: 'keep-all',
              textShadow: '0 0 20px rgba(255,255,255,0.3)',
            }}
          >
            {displayTitleMain}
          </div>
          {/* 서브 제목 (노란색) - 두 번째 줄 */}
          <div
            style={{
              fontSize: 64,
              fontWeight: 'bold',
              fontFamily,
              color: '#FFD700',
              textAlign: 'center',
              lineHeight: 1.3,
              wordBreak: 'keep-all',
              textShadow: '0 0 20px rgba(255,215,0,0.5)',
              minHeight: 83,  // 서브 제목이 없어도 두 줄 공간 유지
            }}
          >
            {displayTitleSub || '\u00A0'}
          </div>
        </div>
      </div>

      {/* 중앙 이미지 영역 (1080x1080 정방형) */}
      <div
        style={{
          position: 'absolute',
          top: LAYOUT.titleHeight,
          left: 0,
          width: LAYOUT.imageSize,
          height: LAYOUT.imageSize,
          overflow: 'hidden',
        }}
      >
        {imageSlides.map((slide, index) => (
          <Sequence
            key={`img-${index}`}
            from={slide.startFrame}
            durationInFrames={slide.durationInFrames}
          >
            <ImageSlide
              src={slide.src}
              durationInFrames={slide.durationInFrames}
              width={LAYOUT.imageSize}
              height={LAYOUT.imageSize}
            />
          </Sequence>
        ))}

        {/* 자막 (이미지 영역 내 하단) */}
        {audioSegments.map((segment, segmentIndex) => {
          const framesPerSubtitle = Math.floor(segment.durationInFrames / segment.subtitles.length);

          return (
            <Sequence
              key={`sub-${segmentIndex}`}
              from={segment.startFrame}
              durationInFrames={segment.durationInFrames}
            >
              {segment.subtitles.map((subtitle, subtitleIndex) => {
                const subtitleStart = subtitleIndex * framesPerSubtitle;
                const subtitleEnd = (subtitleIndex + 1) * framesPerSubtitle;

                return (
                  <Subtitle
                    key={subtitleIndex}
                    text={subtitle}
                    startFrame={subtitleStart}
                    endFrame={subtitleEnd}
                    fontUrl={fontUrl}
                  />
                );
              })}
            </Sequence>
          );
        })}
      </div>

      {/* 하단 빈 영역 (210px) - 검정 배경 */}
      <div
        style={{
          position: 'absolute',
          top: LAYOUT.titleHeight + LAYOUT.imageSize,
          left: 0,
          width: LAYOUT.width,
          height: LAYOUT.bottomHeight,
          backgroundColor: '#000',
        }}
      />

      {/* 오디오 레이어 */}
      {audioSegments.map((segment, segmentIndex) => (
        <Sequence
          key={`audio-${segmentIndex}`}
          from={segment.startFrame}
          durationInFrames={segment.durationInFrames}
        >
          <Audio src={segment.audioPath} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
