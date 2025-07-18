// import { PartialType } from '@nestjs/mapped-types';
// import { CreateCcemailDto } from './create-ccemail.dto';

// export class UpdateCcemailDto extends PartialType(CreateCcemailDto) {}

import { z } from 'zod';

export const UpdateCcemailSchema = z.object({
  nama: z.string().min(1, { message: 'Nama wajib diisi' }).max(255),
  // .optional(), // Nullable field
  email: z
    .string()
    .email({ message: 'Invalid email format' })
    .min(1, { message: 'email wajib diisi' })
    .max(255),
  modifiedby: z.string().max(50).optional(),
  statusaktif: z.number().min(1, { message: 'Status aktif wajib di isi' }),
  // created_at: z.string().optional(), // Can still be a string (ISO Date format)
  // updated_at: z.string().optional(), // Can still be a string (ISO Date format)
});

export type UpdateCcemailDto = z.infer<typeof UpdateCcemailSchema>;
