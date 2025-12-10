import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ShortsService } from './shorts/shorts.service';
import * as fs from 'fs';
import * as path from 'path';

// 디렉토리에서 이미지 파일들을 읽어오는 함수
function getImagesFromDir(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath);
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  return files
    .filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
    .sort()
    .map(file => path.join(dirPath, file));
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const shortsService = app.get(ShortsService);

  // 디렉토리에서 이미지 자동 로드
  const imageDirs = [
    'assets/vehicles/hyundai_ioniq9',
  ];

  // 전체 이미지 조합
  const images = imageDirs.flatMap(dir => getImagesFromDir(dir));

  console.log('Creating shorts video...');
  console.log('Topic: 아이오닉9, 이 가격 실화야?');
  console.log('Images:', images.length, '개');

  const result = await shortsService.createShorts({
    topic: '아이오닉9 가격 공개! 6715만원부터 7941만원까지! 대형 전기 SUV인데 이 가격 실화야? 532km 주행거리에 초고속 충전, 6인승 7인승까지! 경쟁차 대비 가성비 어떤지 팩트체크 해볼게!',
    images,
    projectName: '아이오닉9_가격_실화야',
    maxDuration: 60,
    segmentCount: 5,
    imageIntervalSeconds: 2.5,
    titleMain: '아이오닉9',
    titleSub: '이 가격 실화야?',
  });

  console.log('\n✅ 완료!');
  console.log('영상 경로:', result.videoPath);
  console.log('프로젝트 폴더:', result.projectPath);
  console.log('제목:', result.title);

  await app.close();
}

bootstrap().catch(console.error);
