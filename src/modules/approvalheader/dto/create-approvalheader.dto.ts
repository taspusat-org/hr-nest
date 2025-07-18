import { z } from 'zod';

export const CreateApprovalHeaderSchema = z.object({
  nama: z
    .string()
    .max(255, { message: 'Nama cannot exceed 255 characters' })
    .nullable(),
  keterangan: z.string().nullable(),
  cabang_id: z
    .number()
    .int({ message: 'cabang_id must be an integer' })
    .optional(), // Optional karena nullable di database
  statusaktif: z
    .number()
    .int({ message: 'statusaktif must be an integer' })
    .optional(), // Optional karena nullable di database
  info: z.string().nullable(),
});

export type CreateApprovalHeaderDto = z.infer<
  typeof CreateApprovalHeaderSchema
>;
