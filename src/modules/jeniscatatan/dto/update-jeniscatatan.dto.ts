import { PartialType } from '@nestjs/mapped-types';
import { CreateJeniscatatanDto } from './create-jeniscatatan.dto';
import { z } from 'zod';

export const UpdateJeniscatatanSchema = z.object({
  nama: z
    .string()
    .trim()
    .min(1, { message: 'Nama Jenis Catatan is required' })
    .max(255),
  keterangan: z.string().trim().max(255).nullable().optional(),
  statusaktif: z
    .number()
    .int({ message: 'statusaktif must be an integer' })
    .nonnegative({ message: 'statusaktif must be a non-negative integer' }), // Ensure non-negative
  modifiedby: z.string().nullable().optional(),
  statusaktifnama: z.string().nullable().optional(),
});

export type UpdateJeniscatatanDto = z.infer<typeof UpdateJeniscatatanSchema>;
