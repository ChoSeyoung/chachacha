import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ContentModule } from './content/content.module';
import { TtsModule } from './tts/tts.module';
import { VideoModule } from './video/video.module';
import { ShortsModule } from './shorts/shorts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ContentModule,
    TtsModule,
    VideoModule,
    ShortsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
