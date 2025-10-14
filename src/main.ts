import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { ZodFilter } from './common/utils/zod-filter.exception';
import { LoggingMiddleware } from './common/middlewares/logging.middleware';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as express from 'express';
import * as path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

dotenv.config(); // Memuat file .env

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const uploadDir = path.join(process.cwd(), 'uploads', 'compress');
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }

  app.enableCors({
    origin: [
      'http://localhost:3000',
      '*',
      'http://192.168.3.211:3000',
      'http://localhost:3001',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalFilters(new ZodFilter());
  app.use(
    '/uploads',
    express.static(path.join(process.cwd(), 'uploads/compress')),
  );
  const microservice = app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: ['amqp://admin:admin@54.151.162.192:5672'],
      queue: 'hr_queue_dev',
      queueOptions: {
        durable: true,
      },
    },
  });

  app.use(new LoggingMiddleware().use);
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = (process.env.PORT as unknown as number) ?? 3000;
  console.log('port', port);
  console.log(`Application is running on: http://localhost:${port}`);
  // Start all microservices before the main application server
  await microservice.listen();
  await app.listen(port);

  // Log port after the server is listening
  console.log(`Application is running on: http://localhost:${port}`);
}

void bootstrap();
