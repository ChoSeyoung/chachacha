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

// 가장 최근 프로젝트 폴더 찾기 (수정 시간 기준)
function getLatestProject(): string | null {
  const projectsDir = 'assets/projects';
  if (!fs.existsSync(projectsDir)) return null;

  const projects = fs.readdirSync(projectsDir)
    .filter(f => fs.statSync(path.join(projectsDir, f)).isDirectory())
    .map(f => ({
      name: f,
      mtime: fs.statSync(path.join(projectsDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.mtime - a.mtime);  // 수정 시간 기준 내림차순

  return projects.length > 0 ? path.join(projectsDir, projects[0].name) : null;
}

// script.json에서 설정 읽기
function loadConfig(projectPath: string): { images: string[]; titleMain?: string; titleSub?: string; imageIntervalSeconds?: number } {
  const configPath = path.join(projectPath, 'config.json');
  const scriptPath = path.join(projectPath, 'script.json');

  let config: any = {};

  // config.json이 있으면 읽기
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  // script.json에서 제목 가져오기
  if (fs.existsSync(scriptPath)) {
    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
    if (!config.titleMain) config.titleMain = script.titleMain;
    if (!config.titleSub) config.titleSub = script.titleSub;
  }

  // 이미지 디렉토리 처리
  const imageDirs = config.imageDirs || ['assets/vehicles/hyundai_ioniq9'];
  const images = imageDirs.flatMap((dir: string) => getImagesFromDir(dir));

  return {
    images,
    titleMain: config.titleMain,
    titleSub: config.titleSub,
    imageIntervalSeconds: config.imageIntervalSeconds || 2.5,
  };
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const shortsService = app.get(ShortsService);

  // 프로젝트 경로: 인자로 받거나 가장 최근 프로젝트 사용
  const projectPath = process.argv[2] || getLatestProject();

  if (!projectPath) {
    console.error('❌ 프로젝트를 찾을 수 없습니다.');
    console.error('사용법: npx ts-node src/preview-video.ts [프로젝트경로]');
    process.exit(1);
  }

  if (!fs.existsSync(path.join(projectPath, 'script.json'))) {
    console.error(`❌ script.json을 찾을 수 없습니다: ${projectPath}`);
    process.exit(1);
  }

  // 설정 로드
  const config = loadConfig(projectPath);

  console.log('Creating preview (no audio)...');
  console.log('Project:', projectPath);
  console.log('Images:', config.images.length, '개');

  const result = await shortsService.previewFromScript(
    projectPath,
    config.images,
    {
      imageIntervalSeconds: config.imageIntervalSeconds,
      titleMain: config.titleMain,
      titleSub: config.titleSub,
    }
  );

  console.log('\n✅ 프리뷰 생성 완료! (무음)');
  console.log('프리뷰 경로:', result.previewPath);
  console.log('\n👉 프리뷰를 확인하고, 스크립트 수정 후 render-video.ts로 최종 렌더링하세요.');

  await app.close();
}

bootstrap().catch(console.error);
