import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ShortsService } from './shorts/shorts.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const shortsService = app.get(ShortsService);

  console.log('Generating script only...');

  const result = await shortsService.generateScriptOnly({
    topic: '아이오닉9 가격 공개! 6715만원부터 7941만원까지! 대형 전기 SUV인데 이 가격 실화야? 532km 주행거리에 초고속 충전, 6인승 7인승까지! 경쟁차 대비 가성비 어떤지 팩트체크 해볼게!',
    projectName: '아이오닉9_가격_실화야',
    maxDuration: 60,
    segmentCount: 5,
  });

  console.log('\n✅ 스크립트 생성 완료!');
  console.log('프로젝트 폴더:', result.projectPath);
  console.log('스크립트 파일:', result.scriptPath);
  console.log('\n📝 스크립트 내용:');
  console.log('제목:', result.script.title);
  console.log('\n세그먼트:');
  result.script.segments.forEach((seg, i) => {
    console.log(`\n[${i + 1}] ${seg.text}`);
    if (seg.subtitles) {
      seg.subtitles.forEach((sub, j) => {
        console.log(`    자막 ${j + 1}: ${sub}`);
      });
    }
  });

  console.log('\n👉 스크립트를 검토/수정한 후 render-video.ts를 실행하세요.');

  await app.close();
}

bootstrap().catch(console.error);
