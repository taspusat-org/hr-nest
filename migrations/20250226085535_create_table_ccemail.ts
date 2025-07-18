import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('ccemail', (table) => {
    table.increments('id').primary(); // id dengan tipe BIGINT
    table.text('nama').nullable(); // nama dengan tipe INT
    table.text('email').nullable(); // email dengan tipe NVARCHAR(MAX)
    table.integer('statusaktif').nullable(); // statusaktif dengan tipe INTEGER
    table.text('info').nullable(); // info dengan tipe NVARCHAR(MAX)
    table.string('modifiedby', 200).nullable(); // modifiedby dengan tipe VARCHAR(200)
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable(); // created_at dengan tipe DATETIME
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable(); // updated_at dengan tipe DATETIME
    table.foreign('statusaktif').references('id').inTable('parameter');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('ccemail'); // Menghapus tabel ccemail jika rollback
}
