import { Module } from '@nestjs/common';
import { ShortsService } from './shorts.service';
import { ContentModule } from '../content/content.module';
import { TtsModule } from '../tts/tts.module';
import { VideoModule } from '../video/video.module';

@Module({
  imports: [ContentModule, TtsModule, VideoModule],
  providers: [ShortsService],
  exports: [ShortsService],
})
export class ShortsModule {}
