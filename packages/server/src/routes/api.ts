import { Router } from 'express';
import { authRouter } from './auth.ts';
import { deviceRouter } from './device.ts';
import { registrationsRouter } from './registrations.ts';
import { tokenRouter } from './token.ts';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/device', deviceRouter);
apiRouter.use('/registrations', registrationsRouter);
apiRouter.use('/token', tokenRouter);
