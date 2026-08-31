import mongoose from 'mongoose';

/*
 * Import ESM, nie `require`.
 *
 * Plik miał wcześniej `require('mongoose')` na górze i `export default` na dole, czyli nie
 * był poprawny ani jako CommonJS, ani jako moduł ESM — działał wyłącznie dzięki temu, że
 * bundler Next.js toleruje taką mieszankę. Każde uruchomienie poza bundlerem (test, skrypt
 * jednorazowy, zadanie cykliczne) kończyło się błędem „require is not defined".
 * Wszyscy odbiorcy i tak sięgają po ten moduł przez `import`.
 */

async function connectToDb() {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    if (process.env.NODE_ENV === 'development') {
    console.log('Already connected to the database.');
    }
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  try {
    /*
     * Bez `useNewUrlParser` i `useUnifiedTopology`.
     *
     * Od wersji 4.0 sterownika obie opcje nic nie robią, a przy każdym połączeniu wypisują
     * ostrzeżenie o wycofaniu — w logach produkcyjnych zaśmiecały obraz przy każdym starcie
     * i każdym ponownym połączeniu. W następnej większej wersji sterownika ich przekazanie
     * będzie błędem, nie ostrzeżeniem.
     */
    await mongoose.connect(dbUrl);
    if (process.env.NODE_ENV === 'development') {
    console.log('Successfully connected to the database.');
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
    console.error('Error connecting to the database:', error);
    }
    throw error;
  }
}

export default connectToDb;
