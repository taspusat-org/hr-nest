import { isRecordExist } from 'src/utils/utils.service';
import { z } from 'zod';

export const UpdateCabangSchema = z.object({
  kodecabang: z
    .string()
    .trim()
    .min(1, { message: 'Kode Cabang is required' })
    .max(255),
  // .superRefine(async (kodecabang, ctx) => {
  //     const exists = await isRecordExist('kodecabang', kodecabang, 'cabang');
  //     if (exists) {
  //       ctx.addIssue({
  //         code: z.ZodIssueCode.custom,
  //         message: 'Kodecabang sudah ada',
  //       });
  //     }
  //   }),
  nama: z
    .string()
    .trim()
    .min(1, { message: 'Nama Cabang is required' })
    .max(255),

  statusaktif: z
    .number()
    .int({ message: 'statusaktif must be an integer' })
    .nonnegative({ message: 'statusaktif must be a non-negative integer' }), // Ensure non-negative
  modifiedby: z.string().nullable().optional(),
  periode: z
    .number()
    .int({ message: 'periode must be an integer' })
    .nonnegative({ message: 'periode must be a non-negative integer' }), // Ensure non-negative
});

export type UpdateCabangDto = z.infer<typeof UpdateCabangSchema>;
