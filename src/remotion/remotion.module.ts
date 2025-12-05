import { Module } from '@nestjs/common';
import { RemotionRenderService } from './render.service';

@Module({
  providers: [RemotionRenderService],
  exports: [RemotionRenderService],
})
export class RemotionModule {}
