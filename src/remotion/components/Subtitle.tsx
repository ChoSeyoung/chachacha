import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';

interface SubtitleProps {
  text: string;
  startFrame: number;
  endFrame: number;
  fontUrl?: string;
}

export const Subtitle: React.FC<SubtitleProps> = ({
  text,
  startFrame,
  endFrame,
  fontUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relativeFrame = frame - startFrame;
  const duration = endFrame - startFrame;

  if (frame < startFrame || frame > endFrame) {
    return null;
  }

  // 두둥 효과: 크게 시작해서 살짝 줄어듦 (더 빠르게)
  const scale = spring({
    frame: relativeFrame,
    fps,
    config: {
      damping: 15,
      stiffness: 350,
      mass: 0.3,
    },
    from: 1.4,
    to: 1,
  });

  // 페이드 인 (더 빠르게)
  const opacity = interpolate(
    relativeFrame,
    [0, 2, duration - 4, duration],
    [0, 1, 1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  // 살짝 위로 올라오는 효과 (더 빠르게)
  const translateY = interpolate(
    relativeFrame,
    [0, 4],
    [20, 0],
    {
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }
  );

  const fontFamily = fontUrl ? 'CustomSubtitleFont, sans-serif' : 'sans-serif';

  return (
    <>
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
      <div
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            transform: `scale(${scale}) translateY(${translateY}px)`,
            opacity,
            fontSize: 80,
            fontWeight: 'bold',
            fontFamily,
            color: 'white',
            textShadow: `
              -4px -4px 0 #000,
              4px -4px 0 #000,
              -4px 4px 0 #000,
              4px 4px 0 #000,
              0 0 25px rgba(0,0,0,0.9)
            `,
            textAlign: 'center',
            maxWidth: '90%',
            wordBreak: 'keep-all',
            lineHeight: 1.2,
          }}
        >
          {text}
        </div>
      </div>
    </>
  );
};
