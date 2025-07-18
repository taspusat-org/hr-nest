// export class CreateCcemailDto {}

import { z } from 'zod';

export const CreateCcemailSchema = z.object({
  nama: z.string().min(1, { message: 'Nama wajib diisi' }).max(255),
  email: z
    .string()
    .email({ message: 'Invalid email format' })
    .min(1, { message: 'email wajib diisi' })
    .max(255),
  modifiedby: z.string().max(50).optional(),
  statusaktif: z
    .number()
    .int({ message: 'Status aktif must be an integer' })
    .min(1, { message: 'Status aktif wajib di isi' }),
});

export type CreateCcemailDto = z.infer<typeof CreateCcemailSchema>;
