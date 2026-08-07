import { Express } from 'express';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

export function setupSwagger(app: Express): void {
  try {
    const options: swaggerJSDoc.Options = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'ZHIRAI Apartment Energy Manager API',
          version: '1.0.0',
        },
        components: {
          securitySchemes: {
            BearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
      apis: ['./src/modules/**/*.ts', './src/modules/**/*.routes.ts'],
    };

    const swaggerSpec = swaggerJSDoc(options);

    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  } catch {
  }
}
