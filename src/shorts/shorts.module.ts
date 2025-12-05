import { Module } from '@nestjs/common';
import { ShortsService } from './shorts.service';
import { ContentModule } from '../content/content.module';
import { TtsModule } from '../tts/tts.module';
import { RemotionModule } from '../remotion/remotion.module';

@Module({
  imports: [ContentModule, TtsModule, RemotionModule],
  providers: [ShortsService],
  exports: [ShortsService],
})
export class ShortsModule {}
