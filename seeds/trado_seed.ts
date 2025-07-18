import type { Knex } from 'knex';

// Define a type for the table row based on the structure provided
interface VehicleTableRow {
  kodetrado: string | null;
  keterangan: string | null;
  statusaktif: number | null;
  statusgerobak: number | null;
  nominalplusborongan: number | null;
  kmawal: number | null;
  kmakhirgantioli: number | null;
  tglakhirgantioli: Knex.Raw<any> | null;
  tglstnkmati: Knex.Raw<any> | null;
  tglasuransimati: Knex.Raw<any> | null;
  tahun: string | null;
  akhirproduksi: string | null;
  merek: string | null;
  norangka: string | null;
  nomesin: string | null;
  nama: string | null;
  nostnk: string | null;
  alamatstnk: string | null;
  tglstandarisasi: Knex.Raw<any> | null;
  tglserviceopname: Knex.Raw<any> | null;
  statusstandarisasi: number | null;
  keteranganprogressstandarisasi: string | null;
  statusjenisplat: number | null;
  tglspeksimati: Knex.Raw<any> | null;
  tglpajakstnk: Knex.Raw<any> | null;
  tglgantiakiterakhir: Knex.Raw<any> | null;
  statusmutasi: number | null;
  statusvalidasikendaraan: number | null;
  tipe: string | null;
  jenis: string | null;
  isisilinder: number | null;
  warna: string | null;
  jenisbahanbakar: string | null;
  jumlahsumbu: number | null;
  jumlahroda: number | null;
  model: string | null;
  nobpkb: string | null;
  statusmobilstoring: number | null;
  mandor_id: number | null;
  supir_id: number | null;
  jumlahbanserap: number | null;
  statusappeditban: number | null;
  statuslewatvalidasi: number | null;
  photostnk: string | null;
  photobpkb: string | null;
  phototrado: string | null;
  modifiedby: string | null;
  created_at: Knex.Raw<any>;
  updated_at: Knex.Raw<any>;
  statusabsensisupir: number | null;
  info: string | null;
  editing_at: Knex.Raw<any> | null;
  editing_by: string | null;
  statusapprovalhistorytradomilikmandor: number | null;
  statusapprovalhistorytradomiliksupir: number | null;
  statusapprovalreminderoligardan: number | null;
  statusapprovalreminderolimesin: number | null;
  statusapprovalreminderolipersneling: number | null;
  statusapprovalremindersaringanhawa: number | null;
  tas_id: number | null;
  tglapprovalhistorytradomilikmandor: Knex.Raw<any> | null;
  tglapprovalhistorytradomiliksupir: Knex.Raw<any> | null;
  tglapprovalreminderoligardan: Knex.Raw<any> | null;
  tglapprovalreminderolimesin: Knex.Raw<any> | null;
  tglapprovalreminderolipersneling: Knex.Raw<any> | null;
  tglapprovalremindersaringanhawa: Knex.Raw<any> | null;
  tglbatasreminderoligardan: Knex.Raw<any> | null;
  tglbatasreminderolimesin: Knex.Raw<any> | null;
  tglbatasreminderolipersneling: Knex.Raw<any> | null;
  tglbatasremindersaringanhawa: Knex.Raw<any> | null;
  tglberlakumilikmandor: Knex.Raw<any> | null;
  tglberlakumiliksupir: Knex.Raw<any> | null;
  tglupdatehistorytradomilikmandor: Knex.Raw<any> | null;
  tglupdatehistorytradomiliksupir: Knex.Raw<any> | null;
  userapprovalhistorytradomilikmandor: string | null;
  userapprovalhistorytradomiliksupir: string | null;
  userapprovalreminderoligardan: string | null;
  userapprovalreminderolimesin: string | null;
  userapprovalreminderolipersneling: string | null;
  userapprovalremindersaringanhawa: string | null;
  kodetradoold: string | null;
  tglstid: Knex.Raw<any> | null;
}

export async function seed(knex: Knex): Promise<void> {
  const data: VehicleTableRow[] = [];
  const batchSize = 30; // Adjust batch size to avoid hitting parameter limits

  // Generate 500 records
  for (let i = 0; i < 500; i++) {
    data.push({
      kodetrado: `TRADO${i + 1}`,
      keterangan: `Description for vehicle ${i + 1}`,
      statusaktif: 1,
      statusgerobak: 247,
      nominalplusborongan: Math.random() * 100000,
      kmawal: Math.random() * 5000,
      kmakhirgantioli: Math.random() * 5000,
      tglakhirgantioli: knex.fn.now(),
      tglstnkmati: knex.fn.now(),
      tglasuransimati: knex.fn.now(),
      tahun: `${2020 + (i % 5)}`,
      akhirproduksi: `${2025}`,
      merek: `Brand${i}`,
      norangka: `NR${i + 1000}`,
      nomesin: `NM${i + 1000}`,
      nama: `Vehicle ${i + 1}`,
      nostnk: `STNK${i + 100}`,
      alamatstnk: `Address for STNK ${i + 1}`,
      tglstandarisasi: knex.fn.now(),
      tglserviceopname: knex.fn.now(),
      statusstandarisasi: 17,
      keteranganprogressstandarisasi: `Progress ${i + 1}`,
      statusjenisplat: 21,
      tglspeksimati: knex.fn.now(),
      tglpajakstnk: knex.fn.now(),
      tglgantiakiterakhir: knex.fn.now(),
      statusmutasi: 23,
      statusvalidasikendaraan: 25,
      tipe: `Type ${i + 1}`,
      jenis: `Jenis ${i + 1}`,
      isisilinder: 4,
      warna: `Color ${i + 1}`,
      jenisbahanbakar: `FuelType ${i + 1}`,
      jumlahsumbu: 2,
      jumlahroda: 4,
      model: `Model ${i + 1}`,
      nobpkb: `BPKB${i + 1}`,
      statusmobilstoring: 27,
      mandor_id: 2,
      supir_id: 0,
      jumlahbanserap: 5,
      statusappeditban: 29,
      statuslewatvalidasi: 31,
      photostnk: `photo_stnk${i + 1}.jpg`,
      photobpkb: `photo_bpkb${i + 1}.jpg`,
      phototrado: `photo_trado${i + 1}.jpg`,
      modifiedby: `user${i}`,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
      statusabsensisupir: 439,
      info: `Info for vehicle ${i + 1}`,
      editing_at: knex.fn.now(),
      editing_by: `editor${i}`,
      statusapprovalhistorytradomilikmandor: null,
      statusapprovalhistorytradomiliksupir: null,
      statusapprovalreminderoligardan: 1,
      statusapprovalreminderolimesin: 1,
      statusapprovalreminderolipersneling: 1,
      statusapprovalremindersaringanhawa: 1,
      tas_id: 1,
      tglapprovalhistorytradomilikmandor: knex.fn.now(),
      tglapprovalhistorytradomiliksupir: knex.fn.now(),
      tglapprovalreminderoligardan: knex.fn.now(),
      tglapprovalreminderolimesin: knex.fn.now(),
      tglapprovalreminderolipersneling: knex.fn.now(),
      tglapprovalremindersaringanhawa: knex.fn.now(),
      tglbatasreminderoligardan: knex.fn.now(),
      tglbatasreminderolimesin: knex.fn.now(),
      tglbatasreminderolipersneling: knex.fn.now(),
      tglbatasremindersaringanhawa: knex.fn.now(),
      tglberlakumilikmandor: knex.fn.now(),
      tglberlakumiliksupir: knex.fn.now(),
      tglupdatehistorytradomilikmandor: knex.fn.now(),
      tglupdatehistorytradomiliksupir: knex.fn.now(),
      userapprovalhistorytradomilikmandor: `userapproval${i}`,
      userapprovalhistorytradomiliksupir: `userapproval${i}`,
      userapprovalreminderoligardan: `userapproval${i}`,
      userapprovalreminderolimesin: `userapproval${i}`,
      userapprovalreminderolipersneling: `userapproval${i}`,
      userapprovalremindersaringanhawa: `userapproval${i}`,
      kodetradoold: `OLDTRADO${i}`,
      tglstid: knex.fn.now(),
    });

    // Insert data in batches to avoid exceeding the parameter limit
    if (data.length === batchSize) {
      await knex('trado').insert(data);
      data.length = 0; // Clear the array after insertion
    }
  }

  // Insert any remaining records
  if (data.length > 0) {
    await knex('trado').insert(data);
  }
}
