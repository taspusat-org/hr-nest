import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('cabang', (table) => {
    table.increments('id').primary(); // id dengan tipe BIGINT
    table.string('kodecabang', 255).nullable(); // kodecabang dengan tipe NVARCHAR(MAX)
    table.text('nama').nullable();
    table.text('keterangan').nullable();
    table.integer('statusaktif').nullable();
    table.text('info').nullable(); // info dengan tipe NVARCHAR(MAX)
    table.string('modifiedby', 200).nullable(); // modifiedby dengan tipe VARCHAR(200)
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable(); // created_at dengan tipe DATETIME
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable(); // updated_at dengan tipe DATETIME
    table.foreign('statusaktif').references('id').inTable('parameter');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('cabang'); // Menghapus tabel cabang jika rollback
}
