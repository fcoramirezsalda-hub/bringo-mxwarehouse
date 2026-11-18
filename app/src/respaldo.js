// Respaldo manual de la base de datos.  Uso: npm run respaldo
// (El servidor ya hace uno al arrancar y cada 6 horas; este sirve antes de una actualización o al cerrar el día.)
const { open, backup, DATA_DIR, BACKUP_DIR } = require('./db');
const db = open();
const file = backup(db);
console.log('Datos:     ' + DATA_DIR);
console.log('Respaldo:  ' + file);
console.log('Para restaurar: detén el servidor, copia ese archivo como "incidencias.db" dentro de la carpeta de datos (borra antes incidencias.db-wal y incidencias.db-shm) y vuelve a iniciar.');
console.log('Las fotos (evidencias) están en ' + require('path').join(DATA_DIR, 'evidencias') + '; cópialas aparte si quieres un respaldo completo. Respaldos guardados en ' + BACKUP_DIR + '.');
