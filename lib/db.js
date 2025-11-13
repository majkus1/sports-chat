const mongoose = require('mongoose');

async function connectToDb() {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    if (process.env.NODE_ENV === 'development') {
      console.log('Already connected to the database.');
    }
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  try {
    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
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
