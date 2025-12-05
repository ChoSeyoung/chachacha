import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ShortsService } from './shorts/shorts.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const shortsService = app.get(ShortsService);

  const ev6Images = [
    'assets/vehicles/kia_ev6/9xko580pqody8bhrqbw4.jpg',
    'assets/vehicles/kia_ev6/cdb0g1hbc94aecv5a3ie.jpg',
    'assets/vehicles/kia_ev6/emz9b2pnaozrigyo0ofs.jpg',
  ];

  const ioniq6Images = [
    'assets/vehicles/hyundai_ioniq6/751e6151dddfe0fc346ade47ad74e29f.jpg',
    'assets/vehicles/hyundai_ioniq6/5c128e1e34f169c09c1e33eaa90046dd.jpg',
    'assets/vehicles/hyundai_ioniq6/3df833c83a1dd12a81c2b9583ebaadb8.jpg',
  ];

  const images = [...ev6Images, ...ioniq6Images];

  console.log('Creating shorts video...');
  console.log('Images:', images);

  const result = await shortsService.createShorts({
    topic: 'EV6 vs 아이오닉6 전기차 비교! 어떤 차가 더 좋을까?',
    images,
    projectName: 'EV6_vs_아이오닉6_비교',
    maxDuration: 60,
  });

  console.log('\n✅ 완료!');
  console.log('영상 경로:', result.videoPath);
  console.log('프로젝트 폴더:', result.projectPath);
  console.log('제목:', result.title);

  await app.close();
}

bootstrap().catch(console.error);
