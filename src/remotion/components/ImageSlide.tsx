import React from 'react';
import {
  useCurrentFrame,
  interpolate,
  Img,
} from 'remotion';

interface ImageSlideProps {
  src: string;
  durationInFrames: number;
  width?: number;
  height?: number;
}

export const ImageSlide: React.FC<ImageSlideProps> = ({
  src,
  durationInFrames,
  width = 1080,
  height = 1080,
}) => {
  const frame = useCurrentFrame();

  // HTTP URL을 그대로 사용 (render.service에서 로컬 서버 URL로 변환됨)
  const imageSrc = src;

  // Ken Burns 효과: 살짝 줌인되면서 이동
  const scale = interpolate(
    frame,
    [0, durationInFrames],
    [1, 1.1],
    {
      extrapolateRight: 'clamp',
    }
  );

  const translateX = interpolate(
    frame,
    [0, durationInFrames],
    [0, -20],
    {
      extrapolateRight: 'clamp',
    }
  );

  const translateY = interpolate(
    frame,
    [0, durationInFrames],
    [0, -10],
    {
      extrapolateRight: 'clamp',
    }
  );

  return (
    <div
      style={{
        width,
        height,
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      <Img
        src={imageSrc}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
        }}
      />
    </div>
  );
};
